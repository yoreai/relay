import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadCatalog, parseCatalog } from "./catalog.ts";
import { relayDataDir } from "./paths.ts";
import { RELAY_VERSION } from "./version.ts";

/**
 * Pull-only freshness reminders. relay never phones home: this module GETs
 * two public files (the catalog on main and the latest release tag), caches
 * the answer for 24h in the local data dir, and turns it into a one-line
 * hint that doctor/status surfaces to humans and agents alike.
 *
 * Opt out entirely with RELAY_NO_UPDATE_CHECK=1 (local-age hints still work —
 * they need no network).
 */

const CATALOG_URL =
  "https://raw.githubusercontent.com/yoreai/relay/main/defaults/catalog.yaml";
const LATEST_RELEASE_URL =
  "https://api.github.com/repos/yoreai/relay/releases/latest";

const CHECK_TTL_MS = 24 * 60 * 60 * 1000;
/** Matches the repo's catalog-review ritual: stale after 45 days untouched. */
const CATALOG_STALE_DAYS = 45;
const FETCH_TIMEOUT_MS = 4_000;

export type FreshnessCache = {
  /** last time we attempted a remote check (success or not) */
  ts: number;
  /** `updated:` date of the catalog on main, if the fetch succeeded */
  remoteCatalogUpdated?: string;
  /** latest release version (no leading v), if the fetch succeeded */
  latestVersion?: string;
};

function cachePath(): string {
  return join(relayDataDir(), "freshness.json");
}

export function loadFreshnessCache(): FreshnessCache | null {
  try {
    const parsed = JSON.parse(readFileSync(cachePath(), "utf8")) as FreshnessCache;
    return typeof parsed.ts === "number" ? parsed : null;
  } catch {
    return null;
  }
}

function saveFreshnessCache(cache: FreshnessCache): void {
  try {
    mkdirSync(dirname(cachePath()), { recursive: true });
    writeFileSync(cachePath(), JSON.stringify(cache, null, 2), "utf8");
  } catch {
    // a failed cache write must never break doctor/status
  }
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Pure composer — everything testable lives here.
 * Returns null when there is nothing worth saying.
 */
export function composeFreshnessHint(
  local: { catalogUpdated: string; version: string },
  remote: { catalogUpdated?: string; latestVersion?: string },
  now: Date = new Date(),
): string | null {
  const hints: string[] = [];

  if (remote.catalogUpdated && remote.catalogUpdated > local.catalogUpdated) {
    hints.push(
      `catalog: update available (${local.catalogUpdated} → ${remote.catalogUpdated}) — run \`relay update\``,
    );
  }

  if (
    remote.latestVersion &&
    compareVersions(remote.latestVersion, local.version) > 0
  ) {
    hints.push(
      `relay: v${remote.latestVersion} available (you have v${local.version}) — \`brew upgrade relay\``,
    );
  }

  // Local-age fallback: no network needed, catches machines that never update.
  if (hints.length === 0) {
    const ageDays =
      (now.getTime() - new Date(local.catalogUpdated).getTime()) / 86_400_000;
    if (Number.isFinite(ageDays) && ageDays > CATALOG_STALE_DAYS) {
      hints.push(
        `catalog: last reviewed ${local.catalogUpdated} (${Math.floor(ageDays)} days ago) — run \`relay update\` to check for changes`,
      );
    }
  }

  return hints.length ? hints.join("\n") : null;
}

/**
 * Refresh the cached remote facts if the cache is older than 24h.
 * Quiet: failures back off for the TTL instead of retrying every call.
 */
export async function refreshFreshnessCache(): Promise<FreshnessCache | null> {
  if (process.env.RELAY_NO_UPDATE_CHECK) return loadFreshnessCache();

  const cached = loadFreshnessCache();
  if (cached && Date.now() - cached.ts < CHECK_TTL_MS) return cached;

  const next: FreshnessCache = { ...cached, ts: Date.now() };

  try {
    const res = await fetch(CATALOG_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.ok) next.remoteCatalogUpdated = parseCatalog(await res.text()).updated;
  } catch {
    // offline is fine — keep whatever we knew before
  }

  try {
    const res = await fetch(LATEST_RELEASE_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": `relay/${RELAY_VERSION}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { tag_name?: string };
      const latest = (json.tag_name ?? "").replace(/^v/, "");
      if (latest) next.latestVersion = latest;
    }
  } catch {
    // same — silence over noise
  }

  saveFreshnessCache(next);
  return next;
}

/**
 * The one call sites use: refresh (cached, quiet), then compose a hint
 * against the local catalog + binary version. Never throws.
 */
export async function freshnessHint(): Promise<string | null> {
  try {
    const cache = await refreshFreshnessCache();
    const { catalog } = loadCatalog();
    return composeFreshnessHint(
      { catalogUpdated: catalog.updated, version: RELAY_VERSION },
      {
        catalogUpdated: cache?.remoteCatalogUpdated,
        latestVersion: cache?.latestVersion,
      },
    );
  } catch {
    return null;
  }
}
