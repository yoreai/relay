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

export function bundledRouterPath(): string {
  return join(import.meta.dir, "..", "defaults", "router.yaml");
}

export function bundledPricesPath(): string {
  return join(import.meta.dir, "..", "defaults", "prices.yaml");
}

export function findPricesPath(cwd: string): string {
  const candidates = [
    join(cwd, "prices.yaml"),
    join(cwd, ".relay", "prices.yaml"),
    join(relayConfigDir(), "prices.yaml"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return bundledPricesPath();
}
