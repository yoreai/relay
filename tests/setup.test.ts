import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySuggestions } from "../src/advise.ts";
import { loadDirective } from "../src/directive.ts";
import { mergeMcpJson } from "../src/setup.ts";

describe("mergeMcpJson", () => {
  test("adds relay to empty config", () => {
    const { out, changed } = mergeMcpJson("");
    expect(changed).toBe(true);
    const cfg = JSON.parse(out);
    expect(cfg.mcpServers.relay.command).toBe("relay");
    expect(cfg.mcpServers.relay.args).toEqual(["mcp", "serve"]);
  });

  test("preserves existing servers", () => {
    const existing = JSON.stringify({
      mcpServers: { other: { command: "other-tool", args: [] } },
    });
    const { out } = mergeMcpJson(existing);
    const cfg = JSON.parse(out);
    expect(cfg.mcpServers.other.command).toBe("other-tool");
    expect(cfg.mcpServers.relay.command).toBe("relay");
  });

  test("idempotent when already registered", () => {
    const first = mergeMcpJson("").out;
    const second = mergeMcpJson(first);
    expect(second.changed).toBe(false);
  });
});

describe("advise --apply", () => {
  test("prepends suggestion to tier fallback list in router.yaml", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-advise-"));
    writeFileSync(
      join(dir, "router.yaml"),
      `version: 1
baseline: fable-5-high
tiers:
  deep:
    - { backend: cursor, model: fable-5-high }
lanes:
  - name: quickfix
    match: { verbs: [fix] }
    tier: deep
default_lane: quickfix
`,
    );

    const msg = applySuggestions(dir, [
      {
        tier: "deep",
        currentBackend: "cursor",
        currentModel: "fable-5-high",
        currentCost: 20,
        backend: "cursor",
        model: "kimi-k3",
        cost: 1.75,
        class: "frontier",
        savingsPct: 91,
      },
    ]);
    expect(msg).toContain("router.yaml");

    const d = loadDirective(dir);
    expect(d.tiers.deep?.[0]?.model).toBe("kimi-k3");
    expect(d.tiers.deep?.[1]?.model).toBe("fable-5-high");
  });

  test("wraps single-object tier into a fallback list", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-advise2-"));
    writeFileSync(
      join(dir, "router.yaml"),
      `version: 1
baseline: fable-5-high
tiers:
  work: { backend: cursor, model: grok-4.5 }
lanes:
  - name: quickfix
    match: { verbs: [fix] }
    tier: work
default_lane: quickfix
`,
    );

    applySuggestions(dir, [
      {
        tier: "work",
        currentBackend: "cursor",
        currentModel: "grok-4.5",
        currentCost: 3,
        backend: "cursor",
        model: "composer-2.5",
        cost: 1.58,
        class: "workhorse",
        savingsPct: 47,
      },
    ]);

    const d = loadDirective(dir);
    expect(d.tiers.work?.[0]?.model).toBe("composer-2.5");
    expect(d.tiers.work?.[1]?.model).toBe("grok-4.5");
  });
});
