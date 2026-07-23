import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { relayConfigDir } from "./paths.ts";

/**
 * Machine-local settings — deliberately separate from router.yaml, which is a
 * shareable directive. "My org hasn't approved Codex" is a property of this
 * machine/person, not of the routing policy a team passes around.
 */
const SettingsSchema = z.object({
  disabled_backends: z.array(z.string()).default([]),
});

export type Settings = z.infer<typeof SettingsSchema>;

export function settingsPath(): string {
  return join(relayConfigDir(), "settings.yaml");
}

export function loadSettings(): Settings {
  try {
    const path = settingsPath();
    if (!existsSync(path)) return { disabled_backends: [] };
    return SettingsSchema.parse(parseYaml(readFileSync(path, "utf8")) ?? {});
  } catch {
    // a corrupt settings file must never brick routing — fall back to all-enabled
    return { disabled_backends: [] };
  }
}

export function saveSettings(settings: Settings): void {
  mkdirSync(relayConfigDir(), { recursive: true });
  const header =
    "# relay machine-local settings (not part of the shareable directive)\n" +
    "# disabled_backends: installed CLIs relay must NOT route work to\n";
  writeFileSync(settingsPath(), header + stringifyYaml(settings), "utf8");
}

export function disabledBackends(): Set<string> {
  return new Set(loadSettings().disabled_backends);
}

/** Enable/disable one backend; returns the new disabled list. */
export function setBackendEnabled(name: string, enabled: boolean): string[] {
  const settings = loadSettings();
  const disabled = new Set(settings.disabled_backends);
  if (enabled) disabled.delete(name);
  else disabled.add(name);
  const next = { ...settings, disabled_backends: [...disabled].sort() };
  saveSettings(next);
  return next.disabled_backends;
}
