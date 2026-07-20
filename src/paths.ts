import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

export function relayConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? join(xdg, "relay") : join(homedir(), ".config", "relay");
}

export function relayDataDir(): string {
  const xdg = process.env.XDG_DATA_HOME;
  return xdg ? join(xdg, "relay") : join(homedir(), ".local", "share", "relay");
}

export function runsLogPath(): string {
  return join(relayDataDir(), "runs.jsonl");
}

/** Resolve directive path: repo override → user config → bundled default. */
export function findDirectivePath(cwd: string): string | null {
  const candidates = [
    join(cwd, "router.yaml"),
    join(cwd, ".relay", "router.yaml"),
    join(relayConfigDir(), "router.yaml"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** Path to an on-disk prices file, or null to use embedded defaults. */
export function findPricesPath(cwd: string): string | null {
  const candidates = [
    join(cwd, "prices.yaml"),
    join(cwd, ".relay", "prices.yaml"),
    join(relayConfigDir(), "prices.yaml"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}
