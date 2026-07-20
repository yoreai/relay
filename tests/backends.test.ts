import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLI_SPECS } from "../src/backends/cli.ts";
import { getBackend, KNOWN_BACKENDS } from "../src/backends/index.ts";
import { parseCatalog } from "../src/catalog.ts";
import { loadDirectiveFromText } from "../src/directive.ts";

const root = join(import.meta.dir, "..");
const catalog = parseCatalog(
  readFileSync(join(root, "defaults", "catalog.yaml"), "utf8"),
);

describe("backend adapters", () => {
  test("every catalog backend has an adapter", () => {
    const known = new Set<string>(KNOWN_BACKENDS);
    for (const [id, m] of Object.entries(catalog.models)) {
      for (const b of m.backends) {
        expect(known.has(b), `model ${id} backend ${b}`).toBe(true);
      }
    }
  });

  test("getBackend resolves all known backends", () => {
    for (const name of KNOWN_BACKENDS) {
      expect(getBackend(name).name).toBe(name);
    }
    expect(() => getBackend("nonexistent")).toThrow(/Unknown backend/);
  });

  test("codex spec builds a sandboxed exec invocation", () => {
    const args = CLI_SPECS.codex!.buildArgs("fix the test", "gpt-5.6-sol");
    expect(args[0]).toBe("exec");
    expect(args).toContain("--model");
    expect(args).toContain("gpt-5.6-sol");
    expect(args).toContain("workspace-write");
    expect(args[args.length - 1]).toBe("fix the test");
    // never pass approval/sandbox bypass flags — permission posture is the user's
    expect(args.join(" ")).not.toContain("dangerously");
  });

  test("default directive candidates all use known backends", () => {
    const directive = loadDirectiveFromText(
      readFileSync(join(root, "defaults", "router.yaml"), "utf8"),
    );
    const known = new Set<string>(KNOWN_BACKENDS);
    for (const candidates of Object.values(directive.tiers)) {
      for (const c of candidates) {
        expect(known.has(c.backend)).toBe(true);
      }
    }
  });
});
