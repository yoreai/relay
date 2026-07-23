import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bumpTier,
  loadDirectiveFromText,
  parseDirective,
  resolveTier,
} from "../src/directive.ts";

const starter = readFileSync(
  join(import.meta.dir, "..", "defaults", "router.yaml"),
  "utf8",
);

describe("directive", () => {
  test("loads starter router.yaml", () => {
    const d = loadDirectiveFromText(starter);
    expect(d.version).toBe(1);
    expect(d.baseline).toBe("fable-5-high");
    expect(d.tiers.work?.[0]?.model).toBe("glm-5.2");
    expect(d.default_lane).toBe("quickfix");
  });

  test("single-object tier still parses (back-compat)", () => {
    const d = loadDirectiveFromText(`
version: 1
baseline: fable-5-high
tiers:
  work: { backend: cursor, model: grok-4.5 }
lanes:
  - name: quickfix
    match: { verbs: [fix] }
    tier: work
default_lane: quickfix
`);
    expect(d.tiers.work).toHaveLength(1);
    expect(resolveTier(d, "work").model).toBe("grok-4.5");
  });

  test("invalid directive throws a readable error, not raw JSON", () => {
    let message = "";
    try {
      parseDirective({ version: 1, baseline: { backend: "cursor" } });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("invalid directive (router.yaml)");
    expect(message).toContain("baseline:");
    expect(message).toContain("relay init");
    expect(message).not.toContain('"code"');
  });

  test("fallback picks first available backend", () => {
    const d = loadDirectiveFromText(starter);
    // cursor missing, claude present → work tier falls back to claude
    const t = resolveTier(d, "work", new Set(["claude"]));
    expect(t.backend).toBe("claude");
    expect(t.model).toBe("sonnet-5");
    expect(t.fallback).toBe(true);
    // cursor present → first candidate, no fallback
    const t2 = resolveTier(d, "work", new Set(["cursor", "claude"]));
    expect(t2.backend).toBe("cursor");
    expect(t2.fallback).toBe(false);
  });

  test("no available backend throws actionable error", () => {
    const d = loadDirectiveFromText(starter);
    expect(() => resolveTier(d, "work", new Set())).toThrow(/relay doctor/);
  });

  test("rejects bad version", () => {
    expect(() => parseDirective({ version: 2, baseline: "x", tiers: {}, lanes: [], default_lane: "x" })).toThrow();
  });

  test("bumpTier climbs toward deep", () => {
    const d = loadDirectiveFromText(starter);
    expect(bumpTier(d, "work")).toBe("review");
    expect(bumpTier(d, "review")).toBe("deep");
    expect(bumpTier(d, "deep")).toBeNull();
  });
});
