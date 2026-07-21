import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
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
  test("reports all primary tools with plain-language summaries", async () => {
    const tools = await probeTools();
    const ids = tools.map((t) => t.id);
    expect(ids).toContain("cursor");
    expect(ids).toContain("claude");
    expect(ids).toContain("codex");
    for (const t of tools) {
      expect(t.summary.length).toBeGreaterThan(0);
    }
  });

  test("auth results are cached to the data dir", async () => {
    await probeTools();
    const cache = JSON.parse(
      readFileSync(
        join(process.env.XDG_DATA_HOME!, "relay", "probe.json"),
        "utf8",
      ),
    );
    // at least one tool present on this machine got an auth entry
    expect(Object.keys(cache).length).toBeGreaterThan(0);
    for (const entry of Object.values(cache) as { ts: number }[]) {
      expect(entry.ts).toBeGreaterThan(Date.now() - 60_000);
    }
  });

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
});
