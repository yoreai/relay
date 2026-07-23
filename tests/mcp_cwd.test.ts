import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requireRunCwd } from "../src/mcp.ts";

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
