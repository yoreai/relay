import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bumpTier,
  loadDirectiveFromText,
  parseDirective,
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
    expect(d.tiers.work?.model).toBe("grok-4.5");
    expect(d.default_lane).toBe("quickfix");
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
