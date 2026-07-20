import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  fetchedCatalogPath,
  loadCatalog,
  parseCatalog,
} from "./catalog.ts";
import { RELAY_VERSION } from "./version.ts";

const CATALOG_URL =
  "https://raw.githubusercontent.com/yoreai/relay/main/defaults/catalog.yaml";
const LATEST_RELEASE_URL =
  "https://api.github.com/repos/yoreai/relay/releases/latest";

export async function runUpdate(opts: { check?: boolean } = {}): Promise<string> {
  const lines: string[] = [];

  // 1. model catalog (facts only — never touches router.yaml)
  try {
    const res = await fetch(CATALOG_URL, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const remote = parseCatalog(text);
    const local = loadCatalog();

    if (remote.updated > local.catalog.updated) {
      if (opts.check) {
        lines.push(
          `catalog: update available ${local.catalog.updated} → ${remote.updated} (run \`relay update\`)`,
        );
      } else {
        const dest = fetchedCatalogPath();
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, text, "utf8");
        lines.push(
          `catalog: updated ${local.catalog.updated} → ${remote.updated} (${Object.keys(remote.models).length} models)`,
        );
        lines.push("  run `relay advise` to see if cheaper same-class models fit your tiers");
      }
    } else {
      lines.push(
        `catalog: up to date (${local.catalog.updated}, source: ${local.source})`,
      );
    }
  } catch (e) {
    lines.push(
      `catalog: fetch failed (${(e as Error).message}) — keeping ${loadCatalog().source}`,
    );
  }

  // 2. binary version hint (informational; upgrades stay explicit via brew)
  try {
    const res = await fetch(LATEST_RELEASE_URL, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": `relay/${RELAY_VERSION}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { tag_name?: string };
    const latest = (json.tag_name ?? "").replace(/^v/, "");
    if (latest && compareVersions(latest, RELAY_VERSION) > 0) {
      lines.push(
        `relay: v${latest} available (you have v${RELAY_VERSION}) — \`brew upgrade relay\``,
      );
    } else {
      lines.push(`relay: v${RELAY_VERSION} is current`);
    }
  } catch {
    lines.push("relay: release check skipped (network)");
  }

  return lines.join("\n");
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
