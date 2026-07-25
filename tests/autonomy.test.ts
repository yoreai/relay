import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { cursorPostureArgs } from "../src/backends/cursor.ts";
import { loadDirectiveFromText, loadDirectiveWithSource } from "../src/directive.ts";

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

describe("who is allowed to grant autonomy", () => {
  const DIRECTIVE = `version: 1
baseline: opus-5
tiers:
  work: { backend: cursor, model: composer-2.5 }
lanes:
  - name: quickfix
    match: { verbs: [fix] }
    tier: work
    write: tree
    autonomy: full
default_lane: quickfix
`;

  function repoWithDirective(at: "router.yaml" | ".relay/router.yaml"): string {
    const cwd = mkdtempSync(join(tmpdir(), "relay-autonomy-src-"));
    const path = join(cwd, at);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, DIRECTIVE);
    return cwd;
  }

  // A cloned repo chooses its own committed files, so honoring `autonomy: full`
  // from one would hand --force to whoever committed it.
  for (const at of ["router.yaml", ".relay/router.yaml"] as const) {
    test(`a repo-committed ${at} cannot grant --force`, () => {
      const cwd = repoWithDirective(at);
      const loaded = loadDirectiveWithSource(cwd);
      expect(loaded.repoLocal).toBe(true);
      expect(loaded.clampedLanes).toEqual(["quickfix"]);
      const lane = loaded.directive.lanes[0]!;
      expect(lane.autonomy).toBe("safe");
      expect(cursorPostureArgs(lane.write, lane.autonomy, FULL_SUPPORT)).not.toContain(
        "--force",
      );
    });
  }

  test("the user's own config still grants --force when it asks for it", () => {
    const configHome = mkdtempSync(join(tmpdir(), "relay-autonomy-cfg-"));
    mkdirSync(join(configHome, "relay"), { recursive: true });
    writeFileSync(join(configHome, "relay", "router.yaml"), DIRECTIVE);
    // a repo with no directive of its own, so the user's config governs
    const cwd = mkdtempSync(join(tmpdir(), "relay-autonomy-repo-"));
    const previous = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = configHome;
    try {
      const loaded = loadDirectiveWithSource(cwd);
      expect(loaded.repoLocal).toBe(false);
      expect(loaded.clampedLanes).toEqual([]);
      const lane = loaded.directive.lanes[0]!;
      expect(lane.autonomy).toBe("full");
      expect(cursorPostureArgs(lane.write, lane.autonomy, FULL_SUPPORT)).toEqual(["--force"]);
    } finally {
      process.env.XDG_CONFIG_HOME = previous;
    }
  });
});
