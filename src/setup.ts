import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CLI_SPECS, discoverCliBinary } from "./backends/cli.ts";
import { discoverClaudeBinary } from "./backends/claude.ts";
import { discoverCursorBinary } from "./backends/cursor.ts";
import { probeTools, runLogin, type ToolProbe } from "./probe.ts";
import { which } from "./which.ts";

const RELAY_SERVER = { command: "relay", args: ["mcp", "serve"] };

const RELAY_CODEX_BLOCK = `[mcp_servers.relay]
command = "relay"
args = ["mcp", "serve"]
enabled = true
`;

/** Merge relay into an mcpServers-style JSON config. Pure for testability. */
export function mergeMcpJson(text: string): { out: string; changed: boolean } {
  const cfg = (text.trim() ? JSON.parse(text) : {}) as {
    mcpServers?: Record<string, unknown>;
  };
  cfg.mcpServers ??= {};
  const current = cfg.mcpServers.relay;
  if (current && JSON.stringify(current) === JSON.stringify(RELAY_SERVER)) {
    return { out: text, changed: false };
  }
  cfg.mcpServers.relay = RELAY_SERVER;
  return { out: JSON.stringify(cfg, null, 2) + "\n", changed: true };
}

/** Append or skip relay block in Codex config.toml. Fallback when `codex mcp` is unavailable. */
export function mergeCodexToml(text: string): { out: string; changed: boolean } {
  if (/^\[mcp_servers\.relay\]/m.test(text)) {
    const hasCmd = /^\[mcp_servers\.relay\][\s\S]*?^command\s*=\s*"relay"/m.test(text);
    const hasArgs =
      /^\[mcp_servers\.relay\][\s\S]*?^args\s*=\s*\[\s*"mcp"\s*,\s*"serve"\s*\]/m.test(
        text,
      );
    if (hasCmd && hasArgs) return { out: text, changed: false };
  }
  const trimmed = text.trimEnd();
  const prefix = trimmed ? `${trimmed}\n\n` : "";
  return { out: prefix + RELAY_CODEX_BLOCK, changed: true };
}

function registerInJsonConfig(path: string, createIfMissing: boolean): string {
  const exists = existsSync(path);
  if (!exists && !createIfMissing) {
    return `· skipped ${path} (file not found — configure manually)`;
  }
  const text = exists ? readFileSync(path, "utf8") : "";
  let merged;
  try {
    merged = mergeMcpJson(text);
  } catch {
    return `✗ could not parse ${path} — add relay manually (see README)`;
  }
  if (!merged.changed) return `· already registered in ${path}`;
  if (exists) copyFileSync(path, path + ".relay-bak");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, merged.out, "utf8");
  return `✓ registered relay in ${path}${exists ? ` (backup: ${path}.relay-bak)` : ""}`;
}

function registerInCodexToml(path: string): string {
  const exists = existsSync(path);
  const text = exists ? readFileSync(path, "utf8") : "";
  let merged;
  try {
    merged = mergeCodexToml(text);
  } catch {
    return `✗ could not update ${path}`;
  }
  if (!merged.changed) return `· already registered in ${path}`;
  if (exists) copyFileSync(path, path + ".relay-bak");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, merged.out, "utf8");
  return `✓ registered relay in ${path}${exists ? ` (backup: ${path}.relay-bak)` : ""}`;
}

async function runToolMcpAdd(cmd: string[]): Promise<{ ok: boolean; detail: string }> {
  if (!which(cmd[0]!)) return { ok: false, detail: `${cmd[0]} not on PATH` };
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    const [code, stderr, stdout] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
      new Response(proc.stdout).text(),
    ]);
    if (code !== 0) {
      return { ok: false, detail: (stderr || stdout || `exit ${code}`).trim() };
    }
    const msg = (stdout || stderr).trim().split("\n")[0] ?? "registered";
    return { ok: true, detail: msg };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

async function registerClaudeMcp(): Promise<string> {
  const cfg = join(homedir(), ".claude.json");
  const hasCli = !!discoverClaudeBinary();
  const hasApp = existsSync(cfg);
  if (!hasCli && !hasApp) return "· skipped (Claude Code not installed)";

  if (hasCli) {
    const r = await runToolMcpAdd([
      "claude",
      "mcp",
      "add",
      "-s",
      "user",
      "relay",
      "--",
      "relay",
      "mcp",
      "serve",
    ]);
    if (r.ok) return `✓ ${r.detail} (user scope)`;
  }
  return registerInJsonConfig(cfg, true);
}

async function registerCodexMcp(): Promise<string> {
  const cfg = join(homedir(), ".codex", "config.toml");
  const hasCli = !!discoverCliBinary(CLI_SPECS.codex!);
  const hasApp = existsSync(join(homedir(), ".codex"));
  if (!hasCli && !hasApp) return "· skipped (Codex not installed)";

  if (hasCli || which("codex")) {
    const r = await runToolMcpAdd(["codex", "mcp", "add", "relay", "--", "relay", "mcp", "serve"]);
    if (r.ok) return `✓ ${r.detail}`;
  }
  return registerInCodexToml(cfg);
}

function statusMark(t: ToolProbe): string {
  if (!t.cliPresent) return t.appDetected ? "◐" : "·";
  if (t.authed === true) return "✓";
  if (t.authed === false) return "◐";
  return "✓";
}

async function askYesNo(question: string): Promise<boolean> {
  process.stdout.write(`${question} [Y/n] `);
  const line: string = await new Promise((resolve) => {
    const onData = (chunk: Buffer) => {
      process.stdin.off("data", onData);
      resolve(chunk.toString("utf8"));
    };
    process.stdin.on("data", onData);
  });
  return !/^n/i.test(line.trim());
}

/**
 * Guided setup for people who should never need to memorize CLI commands:
 * probe what's here, say it in plain language, OFFER to run the sign-ins
 * (browser pops where the CLI supports it), then wire up MCP.
 */
export async function runSetup(
  opts: { yes?: boolean; noInput?: boolean } = {},
): Promise<string> {
  const interactive =
    !opts.noInput && (opts.yes === true || process.stdin.isTTY === true);
  const out: string[] = [];
  const say = (s: string) => {
    out.push(s);
    console.log(s);
  };

  say("relay setup");
  say("");
  say("checking which AI coding tools this machine has…");
  const tools = await probeTools({ fresh: true });
  say("");
  for (const t of tools) {
    if (!t.cliPresent && !t.appDetected) continue; // don't advertise absent optional tools
    say(`  ${statusMark(t)} ${t.label.padEnd(26)} ${t.summary}`);
  }
  const absent = tools.filter((t) => !t.cliPresent && !t.appDetected);
  if (absent.length) {
    say(`  · not installed (all optional): ${absent.map((t) => t.id).join(", ")}`);
  }
  say("");

  // offer to fix sign-ins
  for (const t of tools) {
    if (!t.cliPresent || t.authed !== false || !t.login) continue;
    if (t.login.interactive) {
      say(`→ ${t.label}: ${t.login.note}`);
      continue;
    }
    let doIt = opts.yes === true;
    if (!doIt && interactive) {
      doIt = await askYesNo(`→ sign in to ${t.label} now? (${t.login.note})`);
    }
    if (doIt) {
      say(`  signing in — finish in the browser if one opens…`);
      const result = await runLogin(t.id);
      say(`  ${result.message}`);
    } else {
      say(`  later: ${t.login.cmd.join(" ")}`);
    }
  }
  say("");

  // MCP registration — one command wires every agent surface we detect
  say("registering relay MCP…");
  if (tools.find((t) => t.id === "cursor")?.appDetected || discoverCursorBinary()) {
    say(`  cursor: ${registerInJsonConfig(join(homedir(), ".cursor", "mcp.json"), true)}`);
  } else {
    say("  cursor: · skipped (not installed)");
  }
  say(`  claude: ${await registerClaudeMcp()}`);
  say(`  codex:  ${await registerCodexMcp()}`);

  if (!which("relay")) {
    say("");
    say("! `relay` is not on PATH — agents launched outside this shell may not find it.");
    say("  brew install yoreai/tap/relay  (or add the binary's directory to PATH)");
  }

  say("");
  say("done. your agents now have relay_run / relay_status / relay_savings.");
  say("anytime: `relay doctor` shows this picture again.");
  return out.join("\n");
}
