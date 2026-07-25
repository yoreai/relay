import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  composeStaleWarning,
  resetStalenessCache,
  staleServerWarning,
} from "../src/staleness.ts";

/**
 * A host spawns `relay mcp serve` once and keeps it for hours; `brew upgrade`
 * swaps the binary underneath it. Nothing in MCP announces that, so relay has
 * to notice on its own — and only in the one direction that's a problem.
 */

const realPath = process.env.PATH;

afterEach(() => {
  process.env.PATH = realPath;
  resetStalenessCache();
});

describe("composeStaleWarning", () => {
  test("warns, naming both versions and the fix, when the installed binary is newer", () => {
    const w = composeStaleWarning("0.11.0", "0.12.0");
    expect(w).toContain("0.12.0");
    expect(w).toContain("0.11.0");
    expect(w).toMatch(/restart their agent session/);
  });

  test("silent when the versions match", () => {
    expect(composeStaleWarning("0.11.0", "0.11.0")).toBeNull();
  });

  test("silent when running ahead of what's installed — that's development, not staleness", () => {
    expect(composeStaleWarning("0.12.0", "0.11.0")).toBeNull();
  });

  test("silent when the installed version can't be determined", () => {
    expect(composeStaleWarning("0.11.0", null)).toBeNull();
  });

  test("compares numerically, not lexically", () => {
    expect(composeStaleWarning("0.9.0", "0.10.0")).toBeTruthy();
    expect(composeStaleWarning("0.10.0", "0.9.0")).toBeNull();
  });
});

describe("staleServerWarning", () => {
  test("detects a relay on PATH that was installed after this process started", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-fakebin-"));
    const bin = join(dir, "relay");
    writeFileSync(bin, "#!/bin/sh\necho 99.0.0\n");
    chmodSync(bin, 0o755);
    process.env.PATH = dir;
    resetStalenessCache();

    const warning = await staleServerWarning();
    expect(warning).toContain("99.0.0");
  });

  test("says nothing when no relay is on PATH, and never throws", async () => {
    process.env.PATH = mkdtempSync(join(tmpdir(), "relay-emptybin-"));
    resetStalenessCache();
    expect(await staleServerWarning()).toBeNull();
  });

  test("a relay that predates this process is not reported — only replacements are", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-oldbin-"));
    const bin = join(dir, "relay");
    writeFileSync(bin, "#!/bin/sh\necho 99.0.0\n");
    chmodSync(bin, 0o755);
    // mtime well before this process started: the binary we were launched from
    const { utimesSync } = await import("node:fs");
    const longAgo = new Date(Date.now() - 86_400_000);
    utimesSync(bin, longAgo, longAgo);
    process.env.PATH = dir;
    resetStalenessCache();

    expect(await staleServerWarning()).toBeNull();
  });
});
