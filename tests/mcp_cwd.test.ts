import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { requireRunCwd, routingSnapshot } from "../src/mcp.ts";

const original = process.cwd();

afterEach(() => {
  process.chdir(original);
});

describe("requireRunCwd", () => {
  test("explicit cwd passes through untouched", () => {
    expect(requireRunCwd("/some/explicit/path")).toBe("/some/explicit/path");
  });

  test("refuses to default to a directory outside any git repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-nonrepo-"));
    try {
      process.chdir(dir);
      expect(() => requireRunCwd(undefined)).toThrow(/pass cwd/);
    } finally {
      process.chdir(original);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("defaults to process cwd when it is inside a git repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-repo-"));
    try {
      mkdirSync(join(dir, ".git"));
      process.chdir(dir);
      // realpath: macOS tmpdir is a symlink, so compare via cwd itself
      expect(requireRunCwd(undefined)).toBe(process.cwd());
    } finally {
      process.chdir(original);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("routingSnapshot (what relay_doctor tells an agent)", () => {
  test("reports where tiers land, not just auth state", () => {
    const snap = routingSnapshot(process.cwd()) as {
      directive?: { baseline: string; lanes: number };
      tier_resolution?: Record<string, string>;
      catalog?: { models: number; updated: string };
    };
    // an agent must be able to see a stale tier — that is the whole point
    expect(Object.keys(snap.tier_resolution ?? {}).length).toBeGreaterThan(0);
    expect(snap.directive?.baseline).toBeTruthy();
    expect(snap.catalog?.models).toBeGreaterThan(0);
  });

  test("surfaces a prices.yaml that would silently freeze receipts", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-snap-"));
    writeFileSync(
      join(dir, "prices.yaml"),
      "version: 1\nmodels:\n  opus-5:\n    in: 1.0\n    out: 2.0\n",
    );
    const snap = routingSnapshot(dir) as { warnings?: string[] };
    expect(snap.warnings?.join("\n")).toContain("overrides the catalog");
  });

  test("a broken directive is reported, never thrown", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-snap-bad-"));
    writeFileSync(join(dir, "router.yaml"), "version: 1\ntiers: nope\n");
    const snap = routingSnapshot(dir) as { directive_error?: string };
    expect(snap.directive_error).toBeTruthy();
  });
});
