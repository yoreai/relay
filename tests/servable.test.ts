import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { opencodeCatalogId } from "../src/backends/cli.ts";
import {
  invalidateServableCache,
  servableModels,
  servablePredicate,
} from "../src/servable.ts";

// The probe is driven through fake `opencode` binaries (RELAY_OPENCODE_BIN)
// and an isolated data dir (XDG_DATA_HOME) — never the real installation.
const ENV_KEYS = ["RELAY_OPENCODE_BIN", "XDG_DATA_HOME"];
const origEnv = new Map(ENV_KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = origEnv.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function setup(script: string): { bin: string; cacheFile: string } {
  const dir = mkdtempSync(join(tmpdir(), "relay-servable-"));
  const bin = join(dir, "fake-opencode");
  writeFileSync(bin, script, { mode: 0o755 });
  mkdirSync(join(dir, "data", "relay"), { recursive: true });
  process.env.RELAY_OPENCODE_BIN = bin;
  process.env.XDG_DATA_HOME = join(dir, "data");
  return { bin, cacheFile: join(dir, "data", "relay", "servable.json") };
}

// ANSI-wrapped header, a separator, and junk lines around real provider/model
// ids — only the ids may be collected (leading whitespace is tolerated).
const LIST_SCRIPT = `#!/bin/sh
printf '%b' '\\033[1mAvailable models\\033[0m\\n'
echo '--------------------'
echo 'opencode/glm-5.2'
echo 'openai/gpt-5.6-sol'
echo 'abacus/claude-opus-5'
echo '  opencode/big-pickle'
echo 'decoration, not a model'
echo 'UPPER/Case'
`;

describe("servableModels probe parsing", () => {
  test("collects only provider/model lines, stripping ANSI escapes and junk", async () => {
    setup(LIST_SCRIPT);
    const models = await servableModels("opencode", { fresh: true });
    expect(models).toEqual(
      new Set([
        "opencode/glm-5.2",
        "openai/gpt-5.6-sol",
        "abacus/claude-opus-5",
        "opencode/big-pickle",
      ]),
    );
  });

  test("returns null for backends without a probe", async () => {
    setup(LIST_SCRIPT);
    expect(await servableModels("codex")).toBeNull();
    expect(await servableModels("cursor")).toBeNull();
  });

  test("nonzero exit with no cache is a probe failure → null (fail-open)", async () => {
    setup("#!/bin/sh\nexit 1\n");
    expect(await servableModels("opencode")).toBeNull();
  });

  test("an empty parse counts as probe failure", async () => {
    setup("#!/bin/sh\necho 'no models here'\n");
    expect(await servableModels("opencode")).toBeNull();
  });
});

describe("servableModels cache", () => {
  test("a fresh in-TTL hit avoids re-probing; fresh:true bypasses it", async () => {
    const { bin } = setup(LIST_SCRIPT);
    const first = await servableModels("opencode");
    expect(first?.has("opencode/glm-5.2")).toBe(true);

    // change what the binary serves — the cached answer must still win
    writeFileSync(bin, "#!/bin/sh\necho 'openai/other-1'\n", { mode: 0o755 });
    const cached = await servableModels("opencode");
    expect(cached?.has("opencode/glm-5.2")).toBe(true);
    expect(cached?.has("openai/other-1")).toBe(false);

    const fresh = await servableModels("opencode", { fresh: true });
    expect(fresh?.has("openai/other-1")).toBe(true);
  });

  test("corrupt cache file degrades (never throws)", async () => {
    const { cacheFile } = setup("#!/bin/sh\nexit 1\n");
    writeFileSync(cacheFile, "not json {{{");
    expect(await servableModels("opencode")).toBeNull();
  });

  test("probe failure falls back to a stale cache entry regardless of age", async () => {
    const { bin, cacheFile } = setup("#!/bin/sh\nexit 1\n");
    writeFileSync(
      cacheFile,
      JSON.stringify({
        opencode: {
          binary: bin,
          ts: Date.now() - 48 * 60 * 60 * 1000,
          models: ["opencode/glm-5.2"],
        },
      }),
    );
    const models = await servableModels("opencode", { fresh: true });
    expect(models).toEqual(new Set(["opencode/glm-5.2"]));
  });

  // Found live: with the real opencode cached and RELAY_OPENCODE_BIN pointed
  // at a broken one, the failed probe kept filtering with the other install's
  // model list — so the fail-open promise quietly didn't hold.
  test("a cache entry from a different binary is never reused", async () => {
    const { cacheFile } = setup("#!/bin/sh\nexit 1\n");
    writeFileSync(
      cacheFile,
      JSON.stringify({
        opencode: {
          binary: "/some/other/opencode",
          ts: Date.now(),
          models: ["opencode/glm-5.2"],
        },
      }),
    );
    // fresh cache, but it belongs to a different install → fail open
    expect(await servableModels("opencode")).toBeNull();
    expect(await servableModels("opencode", { fresh: true })).toBeNull();
  });

  test("invalidateServableCache drops the entry so the next call re-probes", async () => {
    const { bin } = setup(LIST_SCRIPT);
    await servableModels("opencode");
    invalidateServableCache("opencode");
    writeFileSync(bin, "#!/bin/sh\necho 'openai/other-1'\n", { mode: 0o755 });
    const models = await servableModels("opencode");
    expect(models?.has("openai/other-1")).toBe(true);
  });
});

describe("servablePredicate", () => {
  test("null set is allow-all (fail-open)", () => {
    const p = servablePredicate(null);
    expect(p("opencode", "glm-5.2")).toBe(true);
    expect(p("claude", "sonnet-5")).toBe(true);
  });

  test("filters a mapped id the probe did not list", () => {
    const p = servablePredicate(new Set(["openai/gpt-5.6-sol"]));
    // glm-5.2 maps to opencode/glm-5.2, which the set does not contain
    expect(p("opencode", "glm-5.2")).toBe(false);
  });

  test("user-pinned passthrough ids are checked verbatim", () => {
    const p = servablePredicate(new Set(["openai/gpt-5.6-sol"]));
    expect(p("opencode", "openai/gpt-5.6-sol")).toBe(true);
  });

  test("other backends are never filtered", () => {
    const p = servablePredicate(new Set(["openai/gpt-5.6-sol"]));
    expect(p("claude", "sonnet-5")).toBe(true);
    expect(p("cursor", "composer-2.5")).toBe(true);
  });
});

describe("opencodeCatalogId", () => {
  test("zen ids round-trip through the map", () => {
    expect(opencodeCatalogId("opencode/glm-5.2")).toBe("glm-5.2");
    expect(opencodeCatalogId("opencode/claude-opus-5")).toBe("opus-5");
  });

  test("a foreign provider's slug resolves through the zen-naming map", () => {
    expect(opencodeCatalogId("abacus/claude-opus-5")).toBe("opus-5");
    expect(opencodeCatalogId("openai/gpt-5.6-sol")).toBe("gpt-5.6-sol");
  });

  test("unknown slugs return null", () => {
    expect(opencodeCatalogId("opencode/big-pickle")).toBeNull();
    expect(opencodeCatalogId("openai/no-such-model")).toBeNull();
  });
});
