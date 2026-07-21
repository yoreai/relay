import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CLI_SPECS, discoverCliBinary } from "./backends/cli.ts";
import { claudeModelId, discoverClaudeBinary } from "./backends/claude.ts";
import { discoverCursorBinary, probeCursorAuth } from "./backends/cursor.ts";
import { runCli } from "./backends/spawn.ts";
import { relayDataDir } from "./paths.ts";

/**
 * The probe layer answers three DIFFERENT questions per tool, because they
 * have three different answers (an installed IDE ≠ an installed CLI ≠ a CLI
 * that is signed in for headless/background runs):
 *   1. is the companion app around?  2. is the CLI on PATH?  3. is it authed?
 *
 * Presence checks are free and always live. Auth checks can cost a model
 * call, so they're cached for 24h and refreshed on demand (`--fresh`,
 * `relay setup`, or after a login).
 */

export type ToolProbe = {
  id: string;
  label: string;
  /** companion app detected (e.g. Cursor IDE) even if the CLI is missing */
  appDetected: boolean;
  cliPresent: boolean;
  binary?: string;
  authed: boolean | "unknown";
  /** how a human gets the CLI if it's missing */
  install?: string;
  /** machine-runnable login command (pops a browser where the CLI supports it) */
  login?: { cmd: string[]; note: string; interactive?: boolean };
  /** one plain-language line for non-experts */
  summary: string;
};

const AUTH_TTL_MS = 24 * 60 * 60 * 1000;

type AuthCache = Record<string, { authed: boolean | "unknown"; ts: number; binary?: string }>;

function cachePath(): string {
  return join(relayDataDir(), "probe.json");
}

function loadAuthCache(): AuthCache {
  try {
    return JSON.parse(readFileSync(cachePath(), "utf8")) as AuthCache;
  } catch {
    return {};
  }
}

function saveAuthCache(cache: AuthCache): void {
  mkdirSync(dirname(cachePath()), { recursive: true });
  writeFileSync(cachePath(), JSON.stringify(cache, null, 2), "utf8");
}

export function invalidateAuthCache(id?: string): void {
  const cache = loadAuthCache();
  if (id) delete cache[id];
  saveAuthCache(id ? cache : {});
}

async function cachedAuth(
  id: string,
  binary: string,
  fresh: boolean,
  check: () => Promise<boolean | "unknown">,
): Promise<boolean | "unknown"> {
  const cache = loadAuthCache();
  const hit = cache[id];
  if (
    !fresh &&
    hit &&
    hit.binary === binary &&
    Date.now() - hit.ts < AUTH_TTL_MS
  ) {
    return hit.authed;
  }
  const authed = await check();
  cache[id] = { authed, ts: Date.now(), binary };
  saveAuthCache(cache);
  return authed;
}

async function probeClaudeAuth(bin: string): Promise<boolean | "unknown"> {
  const r = await runCli(
    [bin, "-p", "say only: ok", "--model", claudeModelId("haiku-4.5")],
    { timeoutMs: 45_000 },
  );
  if (r.exitCode === 0 && /\bok\b/i.test(r.stdout)) return true;
  if (/log ?in|authenticat|api key/i.test(r.stdout + r.stderr)) return false;
  return "unknown";
}

async function probeCodexAuth(bin: string): Promise<boolean | "unknown"> {
  const r = await runCli([bin, "login", "status"], { timeoutMs: 10_000 });
  if (/logged in/i.test(r.stdout + r.stderr)) return true;
  if (/not logged in|login required/i.test(r.stdout + r.stderr)) return false;
  return "unknown";
}

function summarize(t: Omit<ToolProbe, "summary">): string {
  if (!t.cliPresent && t.appDetected) {
    return `you have the app, but not its command-line tool — ${t.install ?? "install its CLI to let relay use it"}`;
  }
  if (!t.cliPresent) return "not installed (optional)";
  if (t.authed === true) return "ready";
  if (t.authed === false) {
    return "installed, but needs a one-time sign-in for background runs";
  }
  return "installed (sign-in status unknown — relay will find out on first use)";
}

export async function probeTools(
  opts: { fresh?: boolean } = {},
): Promise<ToolProbe[]> {
  const fresh = opts.fresh ?? false;
  const home = homedir();
  const results: ToolProbe[] = [];

  // Cursor
  {
    const bin = discoverCursorBinary();
    const appDetected =
      existsSync("/Applications/Cursor.app") || existsSync(join(home, ".cursor"));
    const authed = bin
      ? await cachedAuth("cursor", bin, fresh, () => probeCursorAuth(bin))
      : "unknown";
    const base = {
      id: "cursor",
      label: "Cursor CLI (cursor-agent)",
      appDetected,
      cliPresent: !!bin,
      binary: bin ?? undefined,
      authed: bin ? authed : ("unknown" as const),
      install: "install it with: curl https://cursor.com/install -fsS | bash",
      login: bin
        ? { cmd: [bin, "login"], note: "opens your browser to sign in" }
        : undefined,
    };
    results.push({ ...base, summary: summarize(base) });
  }

  // Claude Code
  {
    const bin = discoverClaudeBinary();
    const authed = bin
      ? await cachedAuth("claude", bin, fresh, () => probeClaudeAuth(bin))
      : "unknown";
    const base = {
      id: "claude",
      label: "Claude Code (claude)",
      appDetected: existsSync(join(home, ".claude.json")),
      cliPresent: !!bin,
      binary: bin ?? undefined,
      authed: bin ? authed : ("unknown" as const),
      install: "install it with: npm install -g @anthropic-ai/claude-code",
      login: bin
        ? {
            cmd: [bin],
            note: "open Claude Code in a terminal and run /login once",
            interactive: true,
          }
        : undefined,
    };
    results.push({ ...base, summary: summarize(base) });
  }

  // Codex
  {
    const spec = CLI_SPECS.codex!;
    const bin = discoverCliBinary(spec);
    const authed = bin
      ? await cachedAuth("codex", bin, fresh, () => probeCodexAuth(bin))
      : "unknown";
    const base = {
      id: "codex",
      label: "Codex (codex)",
      appDetected: existsSync(join(home, ".codex")),
      cliPresent: !!bin,
      binary: bin ?? undefined,
      authed: bin ? authed : ("unknown" as const),
      install: "install it with: npm install -g @openai/codex",
      login: bin
        ? { cmd: [bin, "login"], note: "opens your browser to sign in" }
        : undefined,
    };
    results.push({ ...base, summary: summarize(base) });
  }

  // Experimental CLIs — presence only
  for (const [id, spec] of Object.entries(CLI_SPECS)) {
    if (id === "codex") continue;
    const bin = discoverCliBinary(spec);
    const base = {
      id,
      label: `${spec.name} CLI`,
      appDetected: false,
      cliPresent: !!bin,
      binary: bin ?? undefined,
      authed: "unknown" as const,
      login: bin
        ? { cmd: [bin, "login"], note: spec.loginHint }
        : undefined,
    };
    results.push({ ...base, summary: summarize(base) });
  }

  return results;
}

/** Run a tool's login flow (pops a browser where supported), then re-probe. */
export async function runLogin(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  const tools = await probeTools();
  const tool = tools.find((t) => t.id === id);
  if (!tool) return { ok: false, message: `unknown tool "${id}"` };
  if (!tool.cliPresent || !tool.login) {
    return {
      ok: false,
      message: `${tool.label}: CLI not installed — ${tool.install ?? "install it first"}`,
    };
  }
  if (tool.login.interactive) {
    // can't drive a REPL sign-in headlessly — hand back precise instructions
    return {
      ok: false,
      message: `${tool.label}: needs an interactive sign-in — ${tool.login.note}`,
    };
  }

  const r = await runCli(tool.login.cmd, { timeoutMs: 180_000 });
  invalidateAuthCache(id);
  const after = (await probeTools({ fresh: true })).find((t) => t.id === id);

  if (after?.authed === true) {
    return { ok: true, message: `${tool.label}: signed in ✓` };
  }
  const tail = (r.stdout + r.stderr).trim().split("\n").slice(-4).join("\n");
  return {
    ok: false,
    message:
      `${tool.label}: sign-in did not complete` +
      (r.timedOut ? " (timed out waiting — finish it in the browser and re-run)" : "") +
      (tail ? `\n${tail}` : ""),
  };
}
