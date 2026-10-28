import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { requireRunCwd, routingSnapshot } from "../src/mcp.ts";
import { toolEnv } from "../src/env.ts";

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

describe("routingSnapshot autonomy warnings", () => {
  const directive = `version: 1
baseline: test-model
tiers:
  work: { backend: fake, model: test-model }
lanes:
  - { name: quickfix, tier: work, write: tree, autonomy: full }
  - { name: build, tier: work, write: worktree, autonomy: full }
  - { name: safe-write, tier: work, write: tree, autonomy: safe }
  - { name: default-write, tier: work }
  - { name: read-only, tier: work, write: none, autonomy: full }
default_lane: quickfix
`;

  function withConfig(fn: (cwd: string, configPath: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), "relay-snap-autonomy-"));
    const configHome = join(dir, "config");
    const cwd = join(dir, "repo");
    mkdirSync(join(configHome, "relay"), { recursive: true });
    mkdirSync(cwd);
    const previous = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = configHome;
    try {
      fn(cwd, join(configHome, "relay", "router.yaml"));
    } finally {
      if (previous === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  }

  function renderDoctor(cwd: string): string {
    // Keep probes inert and module mocks isolated from the rest of the suite.
    const result = Bun.spawnSync([
      process.execPath,
      "-e",
      `import { mock } from "bun:test";
       mock.module("./src/probe.ts", () => ({ probeTools: async () => [] }));
       mock.module("./src/freshness.ts", () => ({ freshnessHint: async () => null }));
       mock.module("./src/backends/index.ts", () => ({ availableBackends: () => new Set() }));
       const { runDoctor } = await import("./src/doctor.ts");
       console.log(await runDoctor(${JSON.stringify(cwd)}));`,
    ], {
      cwd: join(import.meta.dir, ".."),
      timeout: 5_000,
      env: toolEnv({
        XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME!,
        XDG_DATA_HOME: process.env.XDG_DATA_HOME!,
      }),
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    return result.stdout.toString().replace(/\s+/g, " ");
  }

  test("names every full-autonomy write lane and explains the permission", () => {
    withConfig((cwd, configPath) => {
      writeFileSync(configPath, directive);
      const snap = routingSnapshot(cwd) as { warnings?: string[] };
      expect(snap.warnings).toHaveLength(2);
      for (const name of ["quickfix", "build"]) {
        const warning = snap.warnings?.find((w) => w.includes(`"${name}"`));
        expect(warning).toContain("autonomy: full");
        expect(warning).toContain("unattended command execution");
        expect(warning).toContain("cursor: --force");
      }
    });
  });

  test("terminal doctor output includes the same permission warnings", () => {
    withConfig((cwd, configPath) => {
      writeFileSync(configPath, directive);
      const output = renderDoctor(cwd);
      const snap = routingSnapshot(cwd) as { warnings?: string[] };
      expect(snap.warnings).toHaveLength(2);
      for (const warning of snap.warnings ?? []) expect(output).toContain(warning);
      expect(output).not.toContain('lane "read-only"');
    });
  });

  test("safe and default autonomy stay silent in both surfaces", () => {
    withConfig((cwd, configPath) => {
      writeFileSync(configPath, directive.replaceAll("autonomy: full", "autonomy: safe"));
      expect(routingSnapshot(cwd).warnings).toBeUndefined();
      expect(renderDoctor(cwd)).not.toContain("autonomy: full");
    });
  });

  for (const at of ["router.yaml", ".relay/router.yaml"]) {
    test(`repo-local ${at} cannot produce an active full-autonomy warning`, () => {
      withConfig((cwd) => {
        mkdirSync(join(cwd, ".relay"), { recursive: true });
        writeFileSync(join(cwd, at), directive);
        const snap = routingSnapshot(cwd);
        expect(snap.directive_error).toBeUndefined();
        expect(snap.directive).toMatchObject({ path: join(cwd, at) });
        expect(snap.warnings).toBeUndefined();
        expect(renderDoctor(cwd)).not.toContain("autonomy: full");
      });
    });
  }

  test("autonomy and existing price warnings are both preserved", () => {
    withConfig((cwd, configPath) => {
      writeFileSync(configPath, directive);
      writeFileSync(join(cwd, "prices.yaml"), "version: 1\nmodels:\n  test-model: {}\n");
      const snap = routingSnapshot(cwd) as { warnings?: string[] };
      const warnings = snap.warnings?.join("\n");
      expect(warnings).toContain("autonomy: full");
      expect(warnings).toContain("overrides the catalog");
    });
  });

  test("a malformed directive does not hide existing price warnings", () => {
    withConfig((cwd, configPath) => {
      writeFileSync(configPath, "version: 1\ntiers: nope\n");
      writeFileSync(join(cwd, "prices.yaml"), "version: 1\nmodels:\n  test-model: {}\n");
      const snap = routingSnapshot(cwd) as { directive_error?: string; warnings?: string[] };
      expect(snap.directive_error).toBeTruthy();
      expect(snap.warnings?.join("\n")).toContain("overrides the catalog");
    });
  });
});
