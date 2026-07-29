import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetCursorFlagCache } from "../src/backends/cursor.ts";
import {
  backendPostureWarning,
  composePostureWarning,
  postureWarnings,
} from "../src/posture.ts";
import { formatOutcome, type RunOutcome } from "../src/run.ts";

/**
 * A drifted CLI is allowed to degrade a run — it is not allowed to do it
 * quietly, because the thing being degraded is the user's permission posture.
 */

const realPath = process.env.PATH;
const realBin = process.env.RELAY_CURSOR_BIN;

afterEach(() => {
  process.env.PATH = realPath;
  if (realBin === undefined) delete process.env.RELAY_CURSOR_BIN;
  else process.env.RELAY_CURSOR_BIN = realBin;
  resetCursorFlagCache();
});

/** A cursor-agent stand-in whose `--help` advertises exactly `flags`. */
function stubCursor(flags: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "relay-posture-"));
  const bin = join(dir, "cursor-agent");
  writeFileSync(
    bin,
    `#!/bin/sh\nprintf 'Usage: cursor-agent [options]\\n${flags
      .map((f) => `  ${f} <v>  option\\n`)
      .join("")}'\n`,
  );
  chmodSync(bin, 0o755);
  return dir;
}

describe("composePostureWarning", () => {
  test("names the missing flag, the consequence, and the fix when --mode is gone", () => {
    const w = composePostureWarning("cursor", {
      mode: false,
      sandbox: true,
      trust: true,
    });
    expect(w).toContain("--mode");
    expect(w).toMatch(/read-only lanes/);
    expect(w).toContain("cursor-agent update");
  });

  test("reports a missing --sandbox as the lost sandbox, not as a read-only problem", () => {
    const w = composePostureWarning("cursor", {
      mode: true,
      sandbox: false,
      trust: true,
    });
    expect(w).toContain("--sandbox");
    expect(w).toMatch(/command sandbox/);
    expect(w).not.toMatch(/read-only/);
  });

  test("reports both when both are gone", () => {
    const w = composePostureWarning("cursor", {
      mode: false,
      sandbox: false,
      trust: false,
    });
    expect(w).toContain("--mode");
    expect(w).toContain("--sandbox");
  });

  test("silent when only --trust is missing: relay just doesn't pass it, nothing is reduced", () => {
    expect(
      composePostureWarning("cursor", {
        mode: true,
        sandbox: true,
        trust: false,
      }),
    ).toBeNull();
  });

  test("silent on a fully capable CLI", () => {
    expect(
      composePostureWarning("cursor", { mode: true, sandbox: true, trust: true }),
    ).toBeNull();
  });

  test("says nothing about backends whose flags relay doesn't detect", () => {
    expect(
      composePostureWarning("claude", { mode: false, sandbox: false, trust: false }),
    ).toBeNull();
  });
});

describe("backendPostureWarning", () => {
  test("detects the gap from the CLI's own --help", async () => {
    const dir = stubCursor(["--mode", "--sandbox", "--trust"]);
    process.env.PATH = `${dir}:${process.env.PATH}`;
    process.env.RELAY_CURSOR_BIN = join(dir, "cursor-agent");
    expect(await backendPostureWarning("cursor")).toBeNull();

    resetCursorFlagCache();
    const old = stubCursor(["--sandbox"]); // predates --mode and --trust
    process.env.RELAY_CURSOR_BIN = join(old, "cursor-agent");
    expect(await backendPostureWarning("cursor")).toContain("--mode");
  });

  test("never throws, and stays silent, when the CLI isn't there at all", async () => {
    process.env.PATH = mkdtempSync(join(tmpdir(), "relay-empty-"));
    delete process.env.RELAY_CURSOR_BIN;
    expect(await backendPostureWarning("cursor")).toBeNull();
  });

  test("postureWarnings collects only the backends with something to say", async () => {
    const old = stubCursor(["--sandbox"]);
    process.env.PATH = `${old}:${process.env.PATH}`;
    process.env.RELAY_CURSOR_BIN = join(old, "cursor-agent");
    const all = await postureWarnings(["cursor", "claude", "codex"]);
    expect(all).toHaveLength(1);
    expect(all[0]).toContain("cursor-agent");
  });
});

describe("where the warning surfaces", () => {
  const outcome: RunOutcome = {
    id: "r1",
    lane: "quickfix",
    tier: "cheap",
    backend: "cursor",
    model: "composer-2.5",
    reason: "test",
    filesChanged: [],
    verifyOk: true,
    escalations: 0,
    receipt: null,
    output: "",
  };

  test("a degraded run says so in its own output, not only in doctor", () => {
    const text = formatOutcome({
      ...outcome,
      postureWarning: "cursor-agent on this machine doesn't support --mode — …",
    });
    expect(text).toContain("--mode");
  });

  test("a healthy run stays clean", () => {
    expect(formatOutcome(outcome)).not.toContain("⚠");
  });
});
