import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let prevXdg: string | undefined;

beforeEach(() => {
  prevXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), "relay-settings-"));
});

afterEach(() => {
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXdg;
});

describe("settings", () => {
  test("defaults to nothing disabled when no file exists", async () => {
    const { loadSettings } = await import("../src/settings.ts");
    expect(loadSettings().disabled_backends).toEqual([]);
  });

  test("disable/enable round-trips through the yaml file", async () => {
    const { setBackendEnabled, disabledBackends, settingsPath } = await import(
      "../src/settings.ts"
    );
    expect(setBackendEnabled("codex", false)).toEqual(["codex"]);
    expect(disabledBackends().has("codex")).toBe(true);
    expect(readFileSync(settingsPath(), "utf8")).toContain("codex");

    expect(setBackendEnabled("codex", true)).toEqual([]);
    expect(disabledBackends().has("codex")).toBe(false);
  });

  test("disabled backend disappears from availableBackends but not installedBackends", async () => {
    const { setBackendEnabled } = await import("../src/settings.ts");
    const { availableBackends, installedBackends } = await import(
      "../src/backends/index.ts"
    );
    process.env.RELAY_ALLOW_FAKE = "1";
    try {
      expect(installedBackends().has("fake")).toBe(true);
      expect(availableBackends().has("fake")).toBe(true);

      setBackendEnabled("fake", false);
      expect(installedBackends().has("fake")).toBe(true);
      expect(availableBackends().has("fake")).toBe(false);
    } finally {
      delete process.env.RELAY_ALLOW_FAKE;
      setBackendEnabled("fake", true);
    }
  });

  test("backends command lists and mutates state", async () => {
    const { runBackendsCommand } = await import("../src/backends_cmd.ts");
    expect(runBackendsCommand([])).toContain("backends relay may route work to");
    expect(runBackendsCommand(["disable", "codex"])).toContain("· disabled codex");
    expect(runBackendsCommand([])).toContain("disabled by you");
    expect(runBackendsCommand(["enable", "codex"])).toContain("✓ enabled codex");
    expect(runBackendsCommand(["disable", "nonsense"])).toContain("unknown backend");
  });
});
