import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { invalidateAuthCache, probeTools } from "../src/probe.ts";

let prevXdg: string | undefined;

beforeEach(() => {
  prevXdg = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = mkdtempSync(join(tmpdir(), "relay-probe-"));
});

afterEach(() => {
  if (prevXdg === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = prevXdg;
});

describe("probe", () => {
  test(
    "reports all primary tools with plain-language summaries",
    async () => {
      const tools = await probeTools();
      const ids = tools.map((t) => t.id);
      expect(ids).toContain("cursor");
      expect(ids).toContain("claude");
      expect(ids).toContain("codex");
      for (const t of tools) {
        expect(t.summary.length).toBeGreaterThan(0);
      }
    },
    { timeout: 60_000 },
  );

  test(
    "auth results are cached to the data dir",
    async () => {
    const tools = await probeTools();
    // only tools whose CLI is present get auth-probed (and cached) —
    // on a bare CI runner that set is legitimately empty
    const present = tools.filter(
      (t) => t.cliPresent && ["cursor", "claude", "codex"].includes(t.id),
    );
    const cachePath = join(process.env.XDG_DATA_HOME!, "relay", "probe.json");
    const cache = existsSync(cachePath)
      ? (JSON.parse(readFileSync(cachePath, "utf8")) as Record<
          string,
          { ts: number }
        >)
      : {};
    expect(Object.keys(cache).length).toBe(present.length);
    for (const entry of Object.values(cache)) {
      expect(entry.ts).toBeGreaterThan(Date.now() - 120_000);
    }
    },
    { timeout: 60_000 },
  );

  test("second probe reuses cache (no fresh flag)", async () => {
    await probeTools();
    const t0 = Date.now();
    await probeTools();
    // cached probe must be near-instant (no model-call auth checks)
    expect(Date.now() - t0).toBeLessThan(1_500);
  });

  test("invalidateAuthCache clears entries", async () => {
    await probeTools();
    invalidateAuthCache();
    const cache = JSON.parse(
      readFileSync(
        join(process.env.XDG_DATA_HOME!, "relay", "probe.json"),
        "utf8",
      ),
    );
    expect(Object.keys(cache).length).toBe(0);
  });

  test("fresh probe scoped with `only` re-checks just that tool", async () => {
    // Fake binaries (invoked via the RELAY_*_BIN overrides) let us prove the
    // scoping without depending on which real CLIs happen to be installed.
    const dir = mkdtempSync(join(tmpdir(), "relay-probe-only-"));
    const callsFile = join(dir, "calls.log");
    const makeFakeBin = (name: string, stdout: string): string => {
      const p = join(dir, name);
      writeFileSync(p, `#!/bin/sh\necho ${name} >> "${callsFile}"\necho "${stdout}"\n`, {
        mode: 0o755,
      });
      return p;
    };
    const cursorBin = makeFakeBin("fake-cursor", "ok");
    const claudeBin = makeFakeBin("fake-claude", "ok");
    const codexBin = makeFakeBin("fake-codex", "logged in");

    const prev = {
      cursor: process.env.RELAY_CURSOR_BIN,
      claude: process.env.RELAY_CLAUDE_BIN,
      codex: process.env.RELAY_CODEX_BIN,
    };
    process.env.RELAY_CURSOR_BIN = cursorBin;
    process.env.RELAY_CLAUDE_BIN = claudeBin;
    process.env.RELAY_CODEX_BIN = codexBin;

    try {
      await probeTools({ fresh: true }); // warm the cache for all three
      writeFileSync(callsFile, "");

      await probeTools({ fresh: true, only: "codex" });

      const calls = readFileSync(callsFile, "utf8").trim().split("\n").filter(Boolean);
      expect(calls).toEqual(["fake-codex"]);
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        const key = `RELAY_${k.toUpperCase()}_BIN`;
        if (v === undefined) delete process.env[key];
        else process.env[key] = v;
      }
    }
  });

  test("probing on a machine with zero CLIs still succeeds", async () => {
    // simulate a bare CI runner: PATH with no agent CLIs
    const prevPath = process.env.PATH;
    process.env.PATH = "/usr/bin:/bin";
    try {
      const tools = await probeTools({ fresh: true });
      for (const t of tools) {
        expect(t.cliPresent).toBe(false);
        expect(t.summary.length).toBeGreaterThan(0);
      }
    } finally {
      process.env.PATH = prevPath;
    }
  });
});
