import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adviseTiers } from "../src/advise.ts";
import { blendedCost, parseCatalog } from "../src/catalog.ts";
import { loadDirectiveFromText } from "../src/directive.ts";
import { EMBEDDED_CATALOG_YAML } from "../src/embedded_defaults.ts";

const root = join(import.meta.dir, "..");
const catalog = parseCatalog(
  readFileSync(join(root, "defaults", "catalog.yaml"), "utf8"),
);
const directive = loadDirectiveFromText(
  readFileSync(join(root, "defaults", "router.yaml"), "utf8"),
);

describe("catalog", () => {
  test("embedded catalog matches file catalog", () => {
    const embedded = parseCatalog(EMBEDDED_CATALOG_YAML);
    expect(Object.keys(embedded.models).sort()).toEqual(
      Object.keys(catalog.models).sort(),
    );
    expect(embedded.updated).toBe(catalog.updated);
  });

  test("every default tier candidate exists in catalog with valid backend", () => {
    for (const candidates of Object.values(directive.tiers)) {
      for (const c of candidates) {
        const m = catalog.models[c.model];
        expect(m).toBeDefined();
        expect(m!.backends).toContain(c.backend);
      }
    }
  });

  test("blended cost favors kimi-k3 over fable at same class", () => {
    const kimi = catalog.models["kimi-k3"]!;
    const fable = catalog.models["fable-5-high"]!;
    expect(kimi.class).toBe(fable.class);
    expect(blendedCost(kimi)).toBeLessThan(blendedCost(fable) * 0.2);
  });
});

describe("advise", () => {
  test("suggests kimi-k3 for deep and composer for work when cursor present", () => {
    const suggestions = adviseTiers(
      directive,
      catalog,
      new Set(["cursor", "claude"]),
    );
    const byTier = Object.fromEntries(suggestions.map((s) => [s.tier, s]));
    expect(byTier.deep?.model).toBe("kimi-k3");
    expect(byTier.deep?.savingsPct).toBeGreaterThan(80);
    expect(byTier.work?.model).toBe("composer-2.5");
  });

  test("never suggests across quality classes", () => {
    const suggestions = adviseTiers(
      directive,
      catalog,
      new Set(["cursor", "claude"]),
    );
    for (const s of suggestions) {
      expect(catalog.models[s.model]?.class).toBe(s.class);
    }
  });

  test("fast tiers only get fast replacements", () => {
    const suggestions = adviseTiers(
      directive,
      catalog,
      new Set(["cursor", "claude"]),
    );
    const fast = suggestions.find((s) => s.tier === "fast");
    if (fast) {
      expect(catalog.models[fast.model]?.fast).toBe(true);
    }
  });

  test("only suggests models on installed backends", () => {
    const suggestions = adviseTiers(directive, catalog, new Set(["claude"]));
    for (const s of suggestions) {
      expect(s.backend).toBe("claude");
    }
  });

  test("includes local verify evidence when enough runs exist", () => {
    const suggestions = adviseTiers(
      directive,
      catalog,
      new Set(["cursor", "claude"]),
      { "kimi-k3": { runs: 10, ok: 9 } },
    );
    const deep = suggestions.find((s) => s.tier === "deep");
    expect(deep?.evidence).toContain("9/10");
  });
});
