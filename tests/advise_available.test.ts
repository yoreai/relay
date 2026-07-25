import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  adviseTiers,
  applySuggestions,
  formatSuggestions,
  type TierSuggestion,
} from "../src/advise.ts";
import { parseCatalog } from "../src/catalog.ts";
import { loadDirective, loadDirectiveFromText } from "../src/directive.ts";

// Prices are tuned so the reachable models are NOT 20%+ cheaper than the
// tier's current pick (grok-4.5, blended 2.50) — otherwise advise's
// cheaper-in-class rule fires first and the availability nudge, which only
// fills silence, never appears.
const catalog = parseCatalog(`version: 1
updated: 2026-07-25
classes: [workhorse, frontier]
models:
  grok-4.5:
    class: workhorse
    in: 2
    out: 4
    backends: [grok, cursor]
  glm-5.2:
    class: workhorse
    in: 1.6
    out: 3.6
    backends: [zai, opencode]
  gpt-5.6-sol:
    class: workhorse
    in: 1.8
    out: 3.4
    backends: [openai, opencode]
  luna-9:
    class: workhorse
    in: 8
    out: 16
    backends: [cursor]
  opus-5:
    class: frontier
    in: 15
    out: 45
    backends: [claude, opencode]
`);

const directive = loadDirectiveFromText(`version: 1
baseline: opus-5
tiers:
  work:
    - { backend: cursor, model: grok-4.5 }
lanes:
  - name: quickfix
    match: { verbs: [fix] }
    tier: work
default_lane: quickfix
`);

const installed = new Set(["cursor", "opencode"]);

describe("advise availability nudges", () => {
  test("zen-servable model: nudge with canonical pin and zen evidence", () => {
    const suggestions = adviseTiers(
      directive,
      catalog,
      installed,
      {},
      new Set(["opencode/glm-5.2"]),
    );
    expect(suggestions).toHaveLength(1);
    const [s] = suggestions;
    expect(s?.kind).toBe("available");
    expect(s?.backend).toBe("opencode");
    expect(s?.model).toBe("glm-5.2");
    expect(s?.savingsPct).toBe(0);
    expect(s?.evidence).toBe("via your zen login");
    expect(s?.pin).toBe("- { backend: opencode, model: glm-5.2 }");
  });

  test("foreign provider: pin carries the full provider/model id", () => {
    const [s] = adviseTiers(
      directive,
      catalog,
      installed,
      {},
      new Set(["openai/gpt-5.6-sol"]),
    );
    expect(s?.kind).toBe("available");
    expect(s?.model).toBe("gpt-5.6-sol");
    expect(s?.evidence).toBe("via your openai login");
    expect(s?.pin).toBe("- { backend: opencode, model: openai/gpt-5.6-sol }");
  });

  test("the cheapest reachable same-class model wins the nudge", () => {
    const [s] = adviseTiers(
      directive,
      catalog,
      installed,
      {},
      new Set(["openai/gpt-5.6-sol", "opencode/glm-5.2"]),
    );
    expect(s?.model).toBe("glm-5.2"); // blended 2.10 < 2.20
  });

  test("a fast tier never gets nudged toward a non-fast model", () => {
    // currentEntry.fast && !m.fast — the same guard the cheaper-rule uses;
    // without it the fast tier was nudged toward abacus/grok-4.5
    const fastCatalog = parseCatalog(`version: 1
updated: 2026-07-25
classes: [workhorse]
models:
  glm-5.2:
    class: workhorse
    fast: true
    in: 1
    out: 2
    backends: [cursor, opencode]
  grok-4.5:
    class: workhorse
    in: 2
    out: 6
    backends: [grok, cursor]
`);
    const fastDirective = loadDirectiveFromText(`version: 1
baseline: glm-5.2
tiers:
  fast:
    - { backend: cursor, model: glm-5.2 }
lanes:
  - name: quickfix
    match: { verbs: [fix] }
    tier: fast
default_lane: quickfix
`);
    const out = adviseTiers(
      fastDirective,
      fastCatalog,
      installed,
      {},
      new Set(["abacus/grok-4.5"]),
    );
    expect(out).toEqual([]);
  });

  test("a reachable fast model still earns the nudge", () => {
    const fastCatalog = parseCatalog(`version: 1
updated: 2026-07-25
classes: [workhorse]
models:
  glm-5.2:
    class: workhorse
    fast: true
    in: 1
    out: 2
    backends: [cursor, opencode]
  gemini-3-flash:
    class: workhorse
    fast: true
    in: 1.4
    out: 2.6
    backends: [gemini, opencode]
`);
    const fastDirective = loadDirectiveFromText(`version: 1
baseline: glm-5.2
tiers:
  fast:
    - { backend: cursor, model: glm-5.2 }
lanes:
  - name: quickfix
    match: { verbs: [fix] }
    tier: fast
default_lane: quickfix
`);
    const [s] = adviseTiers(
      fastDirective,
      fastCatalog,
      installed,
      {},
      new Set(["opencode/gemini-3-flash"]),
    );
    expect(s?.kind).toBe("available");
    expect(s?.model).toBe("gemini-3-flash");
  });

  test("no nudge for a model already among the tier's candidates", () => {
    const pinned = loadDirectiveFromText(`version: 1
baseline: opus-5
tiers:
  work:
    - { backend: cursor, model: grok-4.5 }
    - { backend: opencode, model: glm-5.2 }
lanes:
  - name: quickfix
    match: { verbs: [fix] }
    tier: work
default_lane: quickfix
`);
    expect(
      adviseTiers(pinned, catalog, installed, {}, new Set(["opencode/glm-5.2"])),
    ).toEqual([]);
  });

  test("no nudge when the probe returned nothing (servable null/absent)", () => {
    expect(adviseTiers(directive, catalog, installed, {}, null)).toEqual([]);
    expect(adviseTiers(directive, catalog, installed)).toEqual([]);
  });

  test("no nudge when opencode is not installed", () => {
    expect(
      adviseTiers(
        directive,
        catalog,
        new Set(["cursor"]),
        {},
        new Set(["opencode/glm-5.2"]),
      ),
    ).toEqual([]);
  });

  test("a tier that already yields a cheaper suggestion gets no nudge", () => {
    const pricey = loadDirectiveFromText(`version: 1
baseline: opus-5
tiers:
  work:
    - { backend: cursor, model: luna-9 }
lanes:
  - name: quickfix
    match: { verbs: [fix] }
    tier: work
default_lane: quickfix
`);
    const suggestions = adviseTiers(
      pricey,
      catalog,
      installed,
      {},
      new Set(["opencode/glm-5.2"]),
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.kind).toBe("cheaper");
    expect(suggestions[0]?.model).toBe("glm-5.2");
  });

  test("format renders the pin and the never-auto-applied footer", () => {
    const suggestions = adviseTiers(
      directive,
      catalog,
      installed,
      {},
      new Set(["opencode/glm-5.2"]),
    );
    const out = formatSuggestions(suggestions);
    expect(out).toContain(
      "glm-5.2 available via opencode (via your zen login) — add: - { backend: opencode, model: glm-5.2 }",
    );
    expect(out).toContain(
      "availability suggestions are never auto-applied — add the line to your router.yaml to opt in",
    );
  });
});

describe("advise --apply with availability nudges", () => {
  const nudge: TierSuggestion = {
    tier: "work",
    currentBackend: "cursor",
    currentModel: "grok-4.5",
    currentCost: 2.5,
    backend: "opencode",
    model: "glm-5.2",
    cost: 2.1,
    class: "workhorse",
    savingsPct: 0,
    kind: "available",
    evidence: "via your zen login",
    pin: "- { backend: opencode, model: glm-5.2 }",
  };

  test("available-kind suggestions are never written to router.yaml", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-advise-avail-"));
    const routerPath = join(dir, "router.yaml");
    const yaml = `version: 1
baseline: opus-5
tiers:
  work:
    - { backend: cursor, model: grok-4.5 }
lanes:
  - name: quickfix
    match: { verbs: [fix] }
    tier: work
default_lane: quickfix
`;
    writeFileSync(routerPath, yaml);

    const msg = applySuggestions(dir, [nudge]);
    expect(msg).toContain("availability suggestions skipped");
    expect(readFileSync(routerPath, "utf8")).toBe(yaml);
  });

  test("mixed lists apply the rest and say what was skipped", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-advise-mixed-"));
    writeFileSync(
      join(dir, "router.yaml"),
      `version: 1
baseline: opus-5
tiers:
  work:
    - { backend: cursor, model: luna-9 }
lanes:
  - name: quickfix
    match: { verbs: [fix] }
    tier: work
default_lane: quickfix
`,
    );

    const msg = applySuggestions(dir, [
      nudge,
      {
        tier: "work",
        currentBackend: "cursor",
        currentModel: "luna-9",
        currentCost: 10,
        backend: "opencode",
        model: "glm-5.2",
        cost: 2.1,
        class: "workhorse",
        savingsPct: 79,
        kind: "cheaper",
      },
    ]);
    expect(msg).toContain("availability suggestions skipped");

    const d = loadDirective(dir);
    expect(d.tiers.work).toHaveLength(2);
    expect(d.tiers.work?.[0]?.model).toBe("glm-5.2");
  });
});
