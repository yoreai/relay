import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDirectiveFromText } from "../src/directive.ts";
import { runVerify } from "../src/verify.ts";

function directiveWith(commands: Record<string, string>) {
  return loadDirectiveFromText(`version: 1
baseline: fable-5-high
tiers:
  work: { backend: fake, model: gpt-5.6-luna }
lanes:
  - name: quickfix
    match: { verbs: [fix] }
    tier: work
default_lane: quickfix
verify_commands:
${Object.entries(commands)
  .map(([k, v]) => `  ${k}: "${v}"`)
  .join("\n")}
`);
}

describe("runVerify", () => {
  test("passes when commands succeed, fails when they don't", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-verify-"));
    const ok = await runVerify(dir, directiveWith({ lint: "true" }), ["lint"]);
    expect(ok.ok).toBe(true);

    const bad = await runVerify(dir, directiveWith({ lint: "false" }), ["lint"]);
    expect(bad.ok).toBe(false);
  });

  test("kills hung verify commands instead of blocking the run forever", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-verify-"));
    const start = Date.now();
    const result = await runVerify(
      dir,
      directiveWith({ test: "sleep 60" }),
      ["test"],
      { timeoutMs: 1_500 },
    );
    expect(Date.now() - start).toBeLessThan(10_000);
    expect(result.ok).toBe(false);
    expect(result.results[0]?.output).toContain("timed out");
  });

  test("sets CI=1 so watch-mode test runners exit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-verify-"));
    writeFileSync(join(dir, "check.sh"), "");
    const result = await runVerify(
      dir,
      directiveWith({ lint: "[ x$CI = x1 ]" }),
      ["lint"],
    );
    expect(result.ok).toBe(true);
  });
});
