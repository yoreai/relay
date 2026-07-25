import { statSync } from "node:fs";
import { join } from "node:path";
import { compareVersions } from "./freshness.ts";
import { RELAY_VERSION } from "./version.ts";

/**
 * "The relay answering you is not the relay you installed."
 *
 * Hosts spawn `relay mcp serve` once per session and keep the process alive
 * for hours. `brew upgrade relay` replaces the binary underneath it, so the
 * running server keeps serving the old code — old tools, old flags, old
 * fixes — and nothing in the protocol says so. MCP has no "restart me", and
 * killing the server mid-session would abort in-flight runs to fix what is
 * usually a cosmetic lag, so the honest move is to detect the mismatch and
 * say it in results, which are never cached the way tool descriptions are.
 *
 * Deliberately one-directional: only an installed binary NEWER than this
 * process is worth reporting. Running from source ahead of what's installed
 * is normal development, not a problem to nag about.
 */

/** Re-probe at most this often; a stale server can't fix itself in between. */
const PROBE_TTL_MS = 5 * 60_000;
const PROBE_TIMEOUT_MS = 2_000;

let cache: { at: number; version: string | null } | null = null;

/** Test seam: forget the probe result. */
export function resetStalenessCache(): void {
  cache = null;
}

/** When this process started, in epoch ms. */
function processStartedAt(): number {
  return Date.now() - process.uptime() * 1000;
}

/**
 * First executable `relay` on PATH. Resolved by hand rather than with
 * `Bun.which`, which answers from the PATH the process was launched with and
 * ignores later changes to `process.env.PATH` — fine in production, but it
 * makes this undetectable in a test and surprising anywhere PATH is adjusted.
 */
function relayOnPath(): string | null {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    const candidate = join(dir, "relay");
    try {
      const st = statSync(candidate);
      if (st.isFile() && st.mode & 0o111) return candidate;
    } catch {
      // not here — keep walking PATH
    }
  }
  return null;
}

/**
 * Has the binary on PATH been replaced since we started? A cheap gate so the
 * common case (nothing changed) costs one stat instead of spawning a process.
 */
function binaryReplacedSinceStart(path: string): boolean {
  try {
    return statSync(path).mtimeMs > processStartedAt();
  } catch {
    return false;
  }
}

async function probeInstalledVersion(path: string): Promise<string | null> {
  try {
    const proc = Bun.spawn([path, "--version"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const timer = setTimeout(() => proc.kill(), PROBE_TIMEOUT_MS);
    const [out, code] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    clearTimeout(timer);
    if (code !== 0) return null;
    return out.trim().match(/\d+\.\d+\.\d+/)?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Version of the `relay` on PATH, or null when it can't be determined (not
 * installed, not on PATH, unchanged since we started, probe failed).
 *
 * Only the probe is cached. Caching the quiet answer too would mean an upgrade
 * that lands one second after a tool call goes unreported for the whole TTL —
 * and the quiet path is a single stat, which is not worth caching anyway.
 */
export async function installedVersion(): Promise<string | null> {
  const path = relayOnPath();
  if (!path || !binaryReplacedSinceStart(path)) return null;
  if (cache && Date.now() - cache.at < PROBE_TTL_MS) return cache.version;
  const version = await probeInstalledVersion(path);
  cache = { at: Date.now(), version };
  return version;
}

/** Pure composer — the whole decision, so it can be tested without a machine. */
export function composeStaleWarning(
  running: string,
  installed: string | null,
): string | null {
  if (!installed || compareVersions(installed, running) <= 0) return null;
  return (
    `relay ${installed} is installed but this MCP server is still running ${running} — ` +
    `it was started before the upgrade. Tell the user to restart their agent session ` +
    `(reload the window) to pick up the new version; until then you're using the old one.`
  );
}

/** Never throws: a diagnostic must not be able to fail a run. */
export async function staleServerWarning(): Promise<string | null> {
  try {
    return composeStaleWarning(RELAY_VERSION, await installedVersion());
  } catch {
    return null;
  }
}
