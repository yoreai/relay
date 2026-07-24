import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adviseTiers } from "../src/advise.ts";
import { blendedCost, parseCatalog } from "../src/catalog.ts";
import { loadDirectiveFromText } from "../src/directive.ts";
import { EMBEDDED_CATALOG_YAML } from "../src/embedded_defaults.ts";

const ROOT = join(import.meta.dir, "..");

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

  test("the frontier class holds only independently-verified models", () => {
    // kimi-k2.7-code sat here purely on price and made advise recommend it as a
    // fable-5 replacement for the deep tier. Its only published numbers are
    // vendor-proprietary and trail opus-4.8 on Moonshot's own table.
    const kimi = catalog.models["kimi-k2.7-code"]!;
    const fable = catalog.models["fable-5-high"]!;
    expect(kimi.class).not.toBe(fable.class);
  });

  test("opus-5 undercuts fable-5 without leaving the frontier class", () => {
    const opus5 = catalog.models["opus-5"]!;
    const fable = catalog.models["fable-5-high"]!;
    expect(opus5.class).toBe(fable.class);
    expect(blendedCost(opus5)).toBeLessThan(blendedCost(fable) * 0.6);
  });
});

describe("advise", () => {
  // A directive that has fallen behind the catalog — which is what advise is
  // FOR. The shipped defaults deliberately produce no suggestions (see "the
  // shipped defaults are advise-clean"), so they can't exercise this.
  const staleWork = loadDirectiveFromText(`version: 1
baseline: fable-5-high
tiers:
  work:
    - { backend: cursor, model: glm-5.2 }
  deep:
    - { backend: cursor, model: opus-5 }
lanes:
  - name: quickfix
    match: { verbs: [fix] }
    tier: work
default_lane: quickfix
`);

  test("suggests composer for a stale work tier, nothing for an optimal deep", () => {
    const suggestions = adviseTiers(
      staleWork,
      catalog,
      new Set(["cursor", "claude"]),
    );
    const byTier = Object.fromEntries(suggestions.map((s) => [s.tier, s]));
    expect(byTier.work?.model).toBe("composer-2.5");
    // deep already leads with the cheapest frontier model
    expect(byTier.deep).toBeUndefined();
  });

  test("a directive still on fable-5 is pointed at opus-5, not down a class", () => {
    const stale = loadDirectiveFromText(`version: 1
baseline: fable-5-high
tiers:
  deep:
    - { backend: cursor, model: fable-5-high }
lanes:
  - name: quickfix
    match: { verbs: [fix] }
    tier: deep
default_lane: quickfix
`);
    const [s] = adviseTiers(stale, catalog, new Set(["cursor"]));
    expect(s?.model).toBe("opus-5");
    expect(s?.class).toBe("frontier");
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
      staleWork,
      catalog,
      new Set(["cursor", "claude"]),
      { "composer-2.5": { runs: 10, ok: 9 } },
    );
    const work = suggestions.find((s) => s.tier === "work");
    expect(work?.model).toBe("composer-2.5");
    expect(work?.evidence).toContain("9/10");
  });
});

describe("the shipped defaults are advise-clean", () => {
  // A fresh install told the user their brand-new config was 27% overpriced,
  // because the defaults led with glm-5.2 while a cheaper same-class model sat
  // in the catalog. If advise would immediately propose a change, the default
  // should have BEEN that change.
  test("a new user on any single backend gets no suggestions", () => {
    const directive = loadDirectiveFromText(
      readFileSync(join(ROOT, "defaults", "router.yaml"), "utf8"),
    );
    const catalog = parseCatalog(
      readFileSync(join(ROOT, "defaults", "catalog.yaml"), "utf8"),
    );
    for (const backend of ["cursor", "claude", "codex"]) {
      const suggestions = adviseTiers(
        directive,
        catalog,
        new Set([backend]),
      );
      expect(
        suggestions.map(
          (s) => `${backend}/${s.tier}: ${s.currentModel} → ${s.model}`,
        ),
      ).toEqual([]);
    }
  });

  test("and none with every backend installed", () => {
    const directive = loadDirectiveFromText(
      readFileSync(join(ROOT, "defaults", "router.yaml"), "utf8"),
    );
    const catalog = parseCatalog(
      readFileSync(join(ROOT, "defaults", "catalog.yaml"), "utf8"),
    );
    const all = new Set(["cursor", "claude", "codex", "gemini", "grok", "kimi"]);
    expect(adviseTiers(directive, catalog, all)).toEqual([]);
  });
});
