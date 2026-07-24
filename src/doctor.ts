import { availableBackends } from "./backends/index.ts";
import { disabledBackends } from "./settings.ts";
import { probeTools } from "./probe.ts";
import { loadCatalog } from "./catalog.ts";
import { freshnessHint } from "./freshness.ts";
import { which } from "./which.ts";
import {
  findDirectivePath,
  findPricesPath,
  relayConfigDir,
  relayDataDir,
} from "./paths.ts";
import { loadDirective, resolveTier } from "./directive.ts";
import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

/**
 * A local `prices.yaml` wins over the catalog for every model it lists, and
 * `relay update` can never correct it — so a copy of the price table left in
 * config silently freezes those numbers. Early versions of `relay init` wrote
 * exactly that, so say so instead of quietly pricing receipts off stale rates.
 */
export function pricesShadowWarning(cwd: string): string[] {
  const path = findPricesPath(cwd);
  if (!path) return [];
  try {
    const listed = Object.keys(
      (parseYaml(readFileSync(path, "utf8")) as {
        models?: Record<string, unknown>;
      })?.models ?? {},
    );
    if (listed.length === 0) return [];
    return [
      `prices:     ⚠ ${path} overrides the catalog for ${listed.length} model(s)`,
      `            these prices are frozen — \`relay update\` cannot correct them.`,
      `            delete the file (or its \`models:\` entries) to track the catalog,`,
      `            unless you are pinning a rate you negotiated.`,
    ];
  } catch {
    return [`prices:     ⚠ ${path} could not be parsed`];
  }
}

export async function runDoctor(
  cwd: string = process.cwd(),
  fresh = false,
): Promise<string> {
  const lines: string[] = ["relay doctor", ""];

  const tools = await probeTools({ fresh });
  const disabled = disabledBackends();
  lines.push("tools:");
  for (const t of tools) {
    if (!t.cliPresent && !t.appDetected) continue;
    const off = disabled.has(t.id);
    const mark = off ? "✗" : !t.cliPresent ? "◐" : t.authed === false ? "◐" : "✓";
    lines.push(
      `  ${mark} ${t.label.padEnd(26)} ${off ? "disabled by you (relay backends enable " + t.id + ")" : t.summary}`,
    );
    if (t.cliPresent && t.authed === false && t.login) {
      lines.push(
        `      fix: relay login ${t.id}` +
          (t.login.interactive ? `  (${t.login.note})` : ""),
      );
    }
    if (!t.cliPresent && t.appDetected && t.install) {
      lines.push(`      fix: ${t.install}`);
    }
  }
  lines.push(
    `  (auth checks cached 24h — \`relay doctor --fresh\` re-probes now)`,
  );
  lines.push("");

  const dirPath = findDirectivePath(cwd);
  try {
    const d = loadDirective(cwd);
    lines.push(
      `directive: ${dirPath ?? "(bundled default)"} · ${d.lanes.length} lanes · baseline ${d.baseline}`,
    );
  } catch (e) {
    lines.push(`directive: ERROR ${(e as Error).message}`);
  }

  lines.push(`config dir: ${relayConfigDir()}${existsSync(relayConfigDir()) ? "" : " (missing — run relay init)"}`);
  lines.push(`data dir:   ${relayDataDir()}`);
  try {
    const { catalog, source } = loadCatalog();
    lines.push(
      `catalog:    ${Object.keys(catalog.models).length} models · updated ${catalog.updated} · source ${source} (refresh: relay update)`,
    );
  } catch (e) {
    lines.push(`catalog:    ERROR ${(e as Error).message}`);
  }
  for (const w of pricesShadowWarning(cwd)) lines.push(w);
  lines.push("");

  // Show where each tier actually lands on THIS machine
  try {
    const d = loadDirective(cwd);
    const available = availableBackends();
    lines.push("");
    lines.push("tier resolution (on this machine):");
    for (const tierName of Object.keys(d.tiers)) {
      try {
        const t = resolveTier(d, tierName, available);
        lines.push(
          `  ${tierName.padEnd(7)} → ${t.backend}/${t.model}` +
            (t.fallback ? "  (fallback)" : ""),
        );
      } catch {
        lines.push(`  ${tierName.padEnd(7)} → ✗ no installed backend`);
      }
    }
  } catch {
    // directive already reported above
  }

  lines.push("");
  lines.push(`git: ${which("git") ? "✓ on PATH" : "✗ missing"}`);
  lines.push(`gh:  ${which("gh") ? "✓ on PATH (draft PRs for worktree lanes)" : "· not found (optional)"}`);
  lines.push(`bd:  ${which("bd") ? "✓ on PATH (beads context)" : "· not found (optional)"}`);

  const hint = await freshnessHint();
  if (hint) {
    lines.push("");
    lines.push(...hint.split("\n").map((h) => `⟳ ${h}`));
  }

  lines.push("");
  lines.push("Auth is delegated — relay stores no credentials.");
  return lines.join("\n");
}
