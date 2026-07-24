import { describe, expect, test } from "bun:test";
import { cursorPostureArgs } from "../src/backends/cursor.ts";
import { loadDirectiveFromText } from "../src/directive.ts";

const FULL_SUPPORT = { mode: true, sandbox: true };
const NO_SUPPORT = { mode: false, sandbox: false };

describe("cursorPostureArgs", () => {
  // Empirical (2026-07): headless print mode auto-runs edits and sandboxed
  // commands even without --force. Flags are the only enforcement, so the
  // posture must be explicit for every lane/autonomy combination.
  test("read-only lanes get ask mode — the only enforced read-only", () => {
    expect(cursorPostureArgs("none", undefined, FULL_SUPPORT)).toEqual([
      "--trust",
      "--mode",
      "ask",
    ]);
  });

  test("write lanes default to sandboxed commands, never --force", () => {
    for (const write of ["tree", "worktree"] as const) {
      const args = cursorPostureArgs(write, "safe", FULL_SUPPORT);
      expect(args).toEqual(["--trust", "--sandbox", "enabled"]);
      expect(args).not.toContain("--force");
    }
  });

  test("--force requires the user's explicit autonomy: full opt-in", () => {
    expect(cursorPostureArgs("tree", "full", FULL_SUPPORT)).toEqual(["--force"]);
  });

  test("unset autonomy is safe, not full", () => {
    expect(cursorPostureArgs("tree", undefined, FULL_SUPPORT)).not.toContain("--force");
  });

  test("degrades to plain --trust when the CLI lacks the posture flags", () => {
    expect(cursorPostureArgs("none", undefined, NO_SUPPORT)).toEqual(["--trust"]);
    expect(cursorPostureArgs("tree", "safe", NO_SUPPORT)).toEqual(["--trust"]);
  });
});

describe("lane autonomy in the directive", () => {
  const directive = (autonomyLine: string) =>
    loadDirectiveFromText(`version: 1
baseline: fable-5-high
tiers:
  work: { backend: fake, model: gpt-5.6-luna }
lanes:
  - name: build
    match: { verbs: [build] }
    tier: work
${autonomyLine}
default_lane: build
`);

  test("defaults to safe", () => {
    expect(directive("").lanes[0]?.autonomy).toBe("safe");
  });

  test("full is an explicit per-lane opt-in", () => {
    expect(directive("    autonomy: full").lanes[0]?.autonomy).toBe("full");
  });

  test("rejects unknown autonomy values", () => {
    expect(() => directive("    autonomy: yolo")).toThrow(/autonomy/);
  });
});
