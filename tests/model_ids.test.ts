import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adviseTiers } from "../src/advise.ts";
import { claudeModelId } from "../src/backends/claude.ts";
import {
  kimiFloatingHandle,
  kimiIdMappings,
  kimiModelId,
} from "../src/backends/cli.ts";
import { cursorModelId } from "../src/backends/cursor.ts";
import { opencodeModelId } from "../src/backends/cli.ts";
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

describe("kimiModelId", () => {
  test("maps canonical ids to the managed service's handles", () => {
    // The managed kimi-code OAuth service serves `kimi-code/*` handles, not
    // the open-platform ids — a verbatim pass-through resolved to nothing.
    expect(kimiModelId("kimi-k2.7-code")).toBe("kimi-code/kimi-for-coding");
    expect(kimiModelId("kimi-k2.7-code-highspeed")).toBe(
      "kimi-code/kimi-for-coding-highspeed",
    );
    expect(kimiModelId("kimi-k3")).toBe("kimi-code/k3");
  });

  // The invariant is that a receipt prices the model that ran, so a handle
  // that re-points is only tolerable when it is DECLARED — a prefix check
  // (`kimi-code/…`) passes happily for a moving alias, which is the exact
  // thing it was meant to catch.
  test("every mapping is declared either pinned or floating, never both", () => {
    const { pinned, floating } = kimiIdMappings();
    const ids = [...Object.keys(pinned), ...Object.keys(floating)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(kimiModelId(id)).not.toBe(id); // a declared mapping must map
    }
  });

  test("a pinned handle names a version; a floating one is reported as floating", () => {
    const { pinned, floating } = kimiIdMappings();
    for (const [id, handle] of Object.entries(pinned)) {
      // "k3" carries the version; "kimi-for-coding" names a role instead
      expect(handle, id).toMatch(/k\d/);
      expect(kimiFloatingHandle(id)).toBeNull();
    }
    for (const [id, handle] of Object.entries(floating)) {
      expect(kimiFloatingHandle(id)).toBe(handle);
    }
  });

  test("distinct catalog models never collapse onto one CLI alias", () => {
    const ids = ["kimi-k2.7-code", "kimi-k2.7-code-highspeed", "kimi-k3"];
    const mapped = ids.map(kimiModelId);
    expect(new Set(mapped).size).toBe(ids.length);
  });

  test("k2.6 (open-platform-only) and unknown ids pass through so users can pin", () => {
    expect(kimiModelId("kimi-k2.6")).toBe("kimi-k2.6");
    expect(kimiModelId("moonshotai/kimi-k2.6")).toBe("moonshotai/kimi-k2.6");
  });
});

describe("opencodeModelId", () => {
  test("maps canonical ids to pinned zen provider ids", () => {
    // claude-family zen ids carry a claude- prefix; other models keep the
    // catalog id verbatim under the opencode/ provider.
    expect(opencodeModelId("opus-5")).toBe("opencode/claude-opus-5");
    expect(opencodeModelId("glm-5.2")).toBe("opencode/glm-5.2");
  });

  test("distinct catalog models never collapse onto one CLI id", () => {
    const ids = [
      "gpt-5.6-luna",
      "gemini-3-flash",
      "haiku-4.5",
      "glm-5.2",
      "grok-4.5",
      "sonnet-5",
      "gemini-3.1-pro",
      "opus-4.8-high",
      "gpt-5.6-sol",
      "opus-5",
      "fable-5-high",
    ];
    const mapped = ids.map(opencodeModelId);
    expect(new Set(mapped).size).toBe(ids.length);
  });

  test("unknown ids pass through so users can pin their own provider/model", () => {
    expect(opencodeModelId("openai/gpt-5.6-sol")).toBe("openai/gpt-5.6-sol");
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
  test("every claude/kimi/opencode catalog model has an explicit id mapping", () => {
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
      if (m.backends.includes("kimi")) {
        // k2.6 is the one deliberate pass-through: the managed OAuth service
        // doesn't serve it, so users pin their own provider alias.
        if (id === "kimi-k2.6") {
          expect(kimiModelId(id)).toBe(id);
        } else {
          // mapped AND declared — a `kimi-code/` prefix alone would let a new
          // moving handle in without anyone noticing
          const { pinned, floating } = kimiIdMappings();
          expect(id in pinned || id in floating, id).toBe(true);
        }
      }
      if (m.backends.includes("opencode")) {
        expect(opencodeModelId(id).startsWith("opencode/")).toBe(true);
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
