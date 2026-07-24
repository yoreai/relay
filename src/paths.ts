import { homedir } from "node:os";
import { join } from "node:path";
import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";

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

/**
 * The data dir holds run history, memory notes, and (with --log-tasks) task
 * text — personal data that default umask left world-readable on shared
 * machines. Owner-only, recursively, and best-effort: permissions must
 * never brick a run. Called once per process at CLI/MCP startup so files
 * created by older relays get tightened too.
 */
export function hardenRelayDataDir(): void {
  try {
    hardenTree(relayDataDir());
  } catch {
    // best-effort
  }
}

function hardenTree(path: string): void {
  if (!existsSync(path)) return;
  const st = statSync(path);
  if (st.isDirectory()) {
    if ((st.mode & 0o077) !== 0) chmodSync(path, 0o700);
    for (const entry of readdirSync(path)) hardenTree(join(path, entry));
  } else if ((st.mode & 0o077) !== 0) {
    chmodSync(path, 0o600);
  }
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
