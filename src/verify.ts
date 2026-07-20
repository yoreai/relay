import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Directive } from "./directive.ts";

export type VerifyResult = {
  ok: boolean;
  results: { name: string; command: string; exitCode: number; output: string }[];
};

export async function runVerify(
  cwd: string,
  directive: Directive,
  verifyNames: string[] | undefined,
): Promise<VerifyResult> {
  if (!verifyNames || verifyNames.length === 0) {
    return { ok: true, results: [] };
  }

  const results: VerifyResult["results"] = [];
  for (const name of verifyNames) {
    const command = resolveVerifyCommand(cwd, directive, name);
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
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    results.push({
      name,
      command,
      exitCode,
      output: (stdout + stderr).slice(0, 4_000),
    });
  }

  return {
    ok: results.every((r) => r.exitCode === 0),
    results,
  };
}

function resolveVerifyCommand(
  cwd: string,
  directive: Directive,
  name: string,
): string | null {
  const configured = directive.verify_commands[name];
  if (configured && configured !== "auto") return configured;

  // repo override file
  const relayYaml = join(cwd, ".relay.yaml");
  if (existsSync(relayYaml)) {
    try {
      const text = readFileSync(relayYaml, "utf8");
      const match = text.match(new RegExp(`^${name}:\\s*(.+)$`, "m"));
      if (match?.[1]) return match[1].trim();
    } catch {
      // ignore
    }
  }

  if (name === "lint") return detectLint(cwd);
  if (name === "test") return detectTest(cwd);
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
