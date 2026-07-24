import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
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
  // repo key hash → sha256 hashes of approved repo-sourced verify commands.
  // Machine-local on purpose: "I trust this repo's committed lint command"
  // is a per-person decision, like git's safe.directory.
  trusted_verify: z.record(z.string(), z.array(z.string())).default({}),
});

export type Settings = z.infer<typeof SettingsSchema>;

export function settingsPath(): string {
  return join(relayConfigDir(), "settings.yaml");
}

export function loadSettings(): Settings {
  try {
    const path = settingsPath();
    if (!existsSync(path)) return { disabled_backends: [], trusted_verify: {} };
    return SettingsSchema.parse(parseYaml(readFileSync(path, "utf8")) ?? {});
  } catch {
    // a corrupt settings file must never brick routing — fall back to all-enabled.
    // (For trusted_verify the fallback is empty, i.e. fail CLOSED: nothing trusted.)
    return { disabled_backends: [], trusted_verify: {} };
  }
}

export function saveSettings(settings: Settings): void {
  mkdirSync(relayConfigDir(), { recursive: true });
  const header =
    "# relay machine-local settings (not part of the shareable directive)\n" +
    "# disabled_backends: installed CLIs relay must NOT route work to\n" +
    "# trusted_verify: per-repo approvals of repo-committed verify commands (managed by `relay trust`)\n";
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

// ---- trusted repo-sourced verify commands -------------------------------

function trustBucket(repoKey: string): string {
  return createHash("sha256").update(repoKey).digest("hex").slice(0, 16);
}

/** Hash of the exact command string — approval dies with any edit to it. */
export function hashVerifyCommand(command: string): string {
  return createHash("sha256").update(command).digest("hex");
}

export function isVerifyCommandTrusted(repoKey: string, command: string): boolean {
  const bucket = loadSettings().trusted_verify[trustBucket(repoKey)];
  return bucket != null && bucket.includes(hashVerifyCommand(command));
}

/** Record approval for repo-sourced verify commands (idempotent). */
export function trustVerifyCommands(repoKey: string, commands: string[]): void {
  const settings = loadSettings();
  const key = trustBucket(repoKey);
  const bucket = new Set(settings.trusted_verify[key] ?? []);
  for (const c of commands) bucket.add(hashVerifyCommand(c));
  saveSettings({
    ...settings,
    trusted_verify: { ...settings.trusted_verify, [key]: [...bucket].sort() },
  });
}
