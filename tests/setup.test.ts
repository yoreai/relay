import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySuggestions } from "../src/advise.ts";
import { loadDirective } from "../src/directive.ts";
import { mergeCodexToml, mergeMcpJson } from "../src/setup.ts";
import { removeCodexToml, removeMcpJson } from "../src/uninstall.ts";

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

describe("mergeCodexToml", () => {
  test("appends relay block to empty config", () => {
    const { out, changed } = mergeCodexToml("");
    expect(changed).toBe(true);
    expect(out).toContain("[mcp_servers.relay]");
    expect(out).toContain('command = "relay"');
  });

  test("idempotent when relay block already correct", () => {
    const existing = `[mcp_servers.relay]
command = "relay"
args = ["mcp", "serve"]
enabled = true
`;
    const { changed } = mergeCodexToml(existing);
    expect(changed).toBe(false);
  });
});

describe("removeMcpJson", () => {
  test("setup → uninstall round-trips to a relay-free config", () => {
    const registered = mergeMcpJson(
      JSON.stringify({ mcpServers: { other: { command: "other-tool", args: [] } } }),
    ).out;
    const { out, changed } = removeMcpJson(registered);
    expect(changed).toBe(true);
    const cfg = JSON.parse(out);
    expect(cfg.mcpServers.relay).toBeUndefined();
    expect(cfg.mcpServers.other.command).toBe("other-tool");
  });

  test("no-op when relay is not registered", () => {
    const { changed } = removeMcpJson(JSON.stringify({ mcpServers: {} }));
    expect(changed).toBe(false);
  });
});

describe("removeCodexToml", () => {
  test("strips the relay block, keeps everything else", () => {
    const existing = `model = "gpt-5.6-sol"

[mcp_servers.other]
command = "other"

[mcp_servers.relay]
command = "relay"
args = ["mcp", "serve"]
enabled = true

[projects."/Users/x"]
trust_level = "trusted"
`;
    const { out, changed } = removeCodexToml(existing);
    expect(changed).toBe(true);
    expect(out).not.toContain("[mcp_servers.relay]");
    expect(out).not.toContain('"relay"');
    expect(out).toContain("[mcp_servers.other]");
    expect(out).toContain('[projects."/Users/x"]');
    expect(out).toContain('model = "gpt-5.6-sol"');
  });

  test("strips a relay block that sits at EOF", () => {
    const { out, changed } = removeCodexToml(mergeCodexToml("").out);
    expect(changed).toBe(true);
    expect(out.trim()).toBe("");
  });

  test("no-op when relay block absent", () => {
    const { changed } = removeCodexToml('[mcp_servers.other]\ncommand = "x"\n');
    expect(changed).toBe(false);
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
        model: "kimi-k2.7-code",
        cost: 1.75,
        class: "frontier",
        savingsPct: 91,
      },
    ]);
    expect(msg).toContain("router.yaml");

    const d = loadDirective(dir);
    expect(d.tiers.deep?.[0]?.model).toBe("kimi-k2.7-code");
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
