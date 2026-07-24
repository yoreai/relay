import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adviseTiers } from "../src/advise.ts";
import { claudeModelId } from "../src/backends/claude.ts";
import { cursorModelId } from "../src/backends/cursor.ts";
import { loadCatalog, parseCatalog } from "../src/catalog.ts";
import { loadDirectiveFromText } from "../src/directive.ts";

const ROOT = join(import.meta.dir, "..");

describe("claudeModelId", () => {
  test("pins full model names — never a floating family alias", () => {
    // A floating alias silently changes which model runs (and therefore what
    // the receipt is pricing) the day a new family member ships: "opus"
    // started resolving to opus-5 on release day.
    const floating = new Set(["opus", "sonnet", "haiku", "fable"]);
    for (const canonical of [
      "sonnet-5",
      "haiku-4.5",
      "opus-5",
      "opus-4.8-high",
      "fable-5-high",
    ]) {
      expect(floating.has(claudeModelId(canonical))).toBe(false);
    }
    expect(claudeModelId("opus-5")).toBe("claude-opus-5");
    expect(claudeModelId("fable-5-high")).toBe("claude-fable-5");
  });

  test("distinct catalog models never collapse onto one CLI model", () => {
    const ids = ["sonnet-5", "haiku-4.5", "opus-5", "opus-4.8-high", "fable-5-high"];
    const mapped = ids.map(claudeModelId);
    expect(new Set(mapped).size).toBe(ids.length);
  });

  test("unknown ids pass through so users can pin their own", () => {
    expect(claudeModelId("claude-something-7")).toBe("claude-something-7");
  });
});

describe("cursorModelId", () => {
  test("opus-5 carries the requested effort", () => {
    expect(cursorModelId("opus-5", "high")).toBe("claude-opus-5-high");
    expect(cursorModelId("opus-5")).toBe("claude-opus-5-medium");
  });
});

describe("advise: superseded models", () => {
  const catalog = parseCatalog(`version: 1
updated: "2026-07-24"
classes: [workhorse, frontier]
models:
  old-flagship:
    class: frontier
    in: 5.0
    out: 25.0
    backends: [cursor]
  new-flagship:
    class: frontier
    in: 5.0
    out: 25.0
    supersedes: [old-flagship]
    backends: [cursor]
  pricey-successor:
    class: frontier
    in: 20.0
    out: 60.0
    supersedes: [budget-pick]
    backends: [cursor]
  budget-pick:
    class: workhorse
    in: 1.0
    out: 4.0
    backends: [cursor]
`);

  const directiveFor = (model: string) =>
    loadDirectiveFromText(`version: 1
baseline: old-flagship
tiers:
  deep:
    - { backend: cursor, model: ${model} }
lanes:
  - name: quickfix
    match: { verbs: [fix] }
    tier: deep
default_lane: quickfix
`);

  test("flags a superseded pick even when the successor saves nothing", () => {
    const out = adviseTiers(
      directiveFor("old-flagship"),
      catalog,
      new Set(["cursor"]),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.model).toBe("new-flagship");
    expect(out[0]?.kind).toBe("supersedes");
    expect(out[0]?.savingsPct).toBe(0);
  });

  test("never proposes a successor that costs more", () => {
    const out = adviseTiers(
      directiveFor("budget-pick"),
      catalog,
      new Set(["cursor"]),
    );
    expect(out.some((s) => s.model === "pricey-successor")).toBe(false);
  });

  test("stays quiet once the tier already uses the successor", () => {
    const out = adviseTiers(
      directiveFor("new-flagship"),
      catalog,
      new Set(["cursor"]),
    );
    expect(out).toHaveLength(0);
  });

  test("shipped catalog upgrades opus-4.8 users to opus-5", () => {
    const shipped = parseCatalog(
      readFileSync(join(ROOT, "defaults", "catalog.yaml"), "utf8"),
    );
    const out = adviseTiers(
      loadDirectiveFromText(`version: 1
baseline: fable-5-high
tiers:
  review:
    - { backend: cursor, model: opus-4.8-high }
lanes:
  - name: quickfix
    match: { verbs: [fix] }
    tier: review
default_lane: quickfix
`),
      shipped,
      new Set(["cursor"]),
    );
    expect(out[0]?.model).toBe("opus-5");
    expect(out[0]?.kind).toBe("supersedes");
  });
});

describe("catalog ↔ backend coverage", () => {
  test("every claude/cursor catalog model has an explicit id mapping", () => {
    const catalog = parseCatalog(
      readFileSync(join(ROOT, "defaults", "catalog.yaml"), "utf8"),
    );
    for (const [id, m] of Object.entries(catalog.models)) {
      // pass-through is legal, but a canonical id that reaches a CLI unchanged
      // is only correct if the CLI happens to use the same string — assert the
      // ones we route to by default are deliberately mapped
      if (m.backends.includes("claude")) {
        expect(claudeModelId(id).startsWith("claude-")).toBe(true);
      }
    }
  });
});

describe("catalog resolution", () => {
  test("an older fetched catalog never shadows a newer embedded one", () => {
    // upgrade hazard: `brew upgrade` ships a new embedded catalog plus a
    // default directive routing to models only it knows, while any user who
    // ever ran `relay update` has a fetched copy that used to win outright.
    const dir = mkdtempSync(join(tmpdir(), "relay-catalog-"));
    const dataDir = join(dir, "relay"); // relayDataDir() = $XDG_DATA_HOME/relay
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, "catalog.yaml"),
      `version: 1
updated: "2000-01-01"
classes: [frontier]
models:
  ancient:
    class: frontier
    in: 1.0
    out: 1.0
    backends: [cursor]
`,
    );

    const prevData = process.env.XDG_DATA_HOME;
    const prevConfig = process.env.XDG_CONFIG_HOME;
    process.env.XDG_DATA_HOME = dir;
    process.env.XDG_CONFIG_HOME = join(dir, "config");
    try {
      const { catalog, source } = loadCatalog();
      expect(source).toBe("embedded");
      expect(catalog.models["opus-5"]).toBeDefined();
    } finally {
      if (prevData === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = prevData;
      if (prevConfig === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prevConfig;
    }
  });
});
