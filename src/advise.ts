import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isSeq, parseDocument, YAMLSeq } from "yaml";
import { availableBackends } from "./backends/index.ts";
import { blendedCost, loadCatalog, type Catalog } from "./catalog.ts";
import {
  loadDirective,
  resolveTier,
  type Directive,
} from "./directive.ts";
import { EMBEDDED_ROUTER_YAML } from "./embedded_defaults.ts";
import { findDirectivePath, relayConfigDir } from "./paths.ts";
import { modelStats, type ModelStats } from "./runlog.ts";

export type TierSuggestion = {
  tier: string;
  currentBackend: string;
  currentModel: string;
  currentCost: number;
  backend: string;
  model: string;
  cost: number;
  class: string;
  savingsPct: number;
  /**
   * "cheaper" — same quality class, meaningfully less money.
   * "supersedes" — the current pick was replaced by a strictly better model at
   * no higher price, so staying put buys nothing.
   */
  kind: "cheaper" | "supersedes";
  evidence?: string;
};

/**
 * The cheapest available model that declares it supersedes `currentId`, at no
 * more than the current price. Costing no more is the guard that keeps
 * `supersedes` a fact about replacement rather than a licence to upsell.
 */
function findSuccessor(
  currentId: string,
  currentEntry: { class: string; fast?: boolean; in: number; out: number },
  catalog: Catalog,
  available: Set<string>,
): { id: string; backend: string; cost: number } | null {
  const currentCost = blendedCost(currentEntry);
  let best: { id: string; backend: string; cost: number } | null = null;

  for (const [id, m] of Object.entries(catalog.models)) {
    if (id === currentId) continue;
    if (!m.supersedes?.includes(currentId)) continue;
    if (currentEntry.fast && !m.fast) continue;
    const backend = m.backends.find((b) => available.has(b));
    if (!backend) continue;
    const cost = blendedCost(m);
    if (cost > currentCost) continue;
    if (!best || cost < best.cost) best = { id, backend, cost };
  }

  return best;
}

/**
 * Pure suggestion engine: for each tier, propose either the successor to a
 * superseded pick (free upgrade) or the cheapest catalog model in the SAME
 * quality class, available on an installed backend, that is at least 20%
 * cheaper (blended) than what the tier resolves to today.
 * Facts propose; the user's directive stays untouched unless --apply.
 */
export function adviseTiers(
  directive: Directive,
  catalog: Catalog,
  available: Set<string>,
  stats: ModelStats = {},
): TierSuggestion[] {
  const suggestions: TierSuggestion[] = [];

  for (const tierName of Object.keys(directive.tiers)) {
    let current;
    try {
      current = resolveTier(directive, tierName, available);
    } catch {
      continue; // no backend for this tier at all — doctor's problem, not advise's
    }

    const currentEntry = catalog.models[current.model];
    if (!currentEntry) continue; // unknown model — nothing to compare against
    const currentCost = blendedCost(currentEntry);

    // A successor at no extra cost wins outright: price-only advice would stay
    // silent here (nothing is saved), yet running the superseded model is
    // simply worse. Applying it re-resolves the tier, so a later `advise` can
    // still propose a cheaper same-class pick on top.
    const successor = findSuccessor(
      current.model,
      currentEntry,
      catalog,
      available,
    );
    if (successor) {
      const s = stats[successor.id];
      suggestions.push({
        tier: tierName,
        currentBackend: current.backend,
        currentModel: current.model,
        currentCost,
        backend: successor.backend,
        model: successor.id,
        cost: successor.cost,
        class: catalog.models[successor.id]!.class,
        savingsPct: Math.max(
          0,
          Math.round((1 - successor.cost / currentCost) * 100),
        ),
        kind: "supersedes",
        evidence:
          s && s.runs >= 3
            ? `local evidence: verified ${s.ok}/${s.runs} runs`
            : undefined,
      });
      continue;
    }

    let best: {
      id: string;
      backend: string;
      cost: number;
    } | null = null;

    for (const [id, m] of Object.entries(catalog.models)) {
      if (id === current.model) continue;
      if (m.class !== currentEntry.class) continue;
      // never trade a latency-optimized pick for a slow one
      if (currentEntry.fast && !m.fast) continue;
      const backend = m.backends.find((b) => available.has(b));
      if (!backend) continue;
      const cost = blendedCost(m);
      if (cost >= currentCost * 0.8) continue; // demand a real (20%+) saving
      if (!best || cost < best.cost) best = { id, backend, cost };
    }

    if (!best) continue;

    const s = stats[best.id];
    suggestions.push({
      tier: tierName,
      currentBackend: current.backend,
      currentModel: current.model,
      currentCost,
      backend: best.backend,
      model: best.id,
      cost: best.cost,
      class: currentEntry.class,
      savingsPct: Math.round((1 - best.cost / currentCost) * 100),
      kind: "cheaper",
      evidence:
        s && s.runs >= 3
          ? `local evidence: verified ${s.ok}/${s.runs} runs`
          : undefined,
    });
  }

  return suggestions;
}

export function formatSuggestions(suggestions: TierSuggestion[]): string {
  if (suggestions.length === 0) {
    return "relay advise: your tiers already use the cheapest same-class models available here";
  }
  const lines = ["relay advise — better model, same or lower price:", ""];
  for (const s of suggestions) {
    const why =
      s.kind === "supersedes"
        ? s.savingsPct > 0
          ? `superseded: strictly better and ~${s.savingsPct}% cheaper`
          : `superseded: strictly better at the same price`
        : `~${s.savingsPct}% cheaper, same ${s.class} class`;
    lines.push(
      `  ${s.tier.padEnd(7)} ${s.currentModel} → ${s.model} (${s.backend}) — ` +
        why +
        (s.evidence ? ` · ${s.evidence}` : ""),
    );
  }
  lines.push("");
  lines.push("apply with: relay advise --apply   (prepends to your router.yaml tier fallbacks)");
  return lines.join("\n");
}

/**
 * Prepend each suggestion as the first fallback candidate in the user's
 * router.yaml (comment-preserving edit). Creates ~/.config/relay/router.yaml
 * from the embedded default if no directive file exists yet.
 */
export function applySuggestions(
  cwd: string,
  suggestions: TierSuggestion[],
): string {
  if (suggestions.length === 0) return "nothing to apply";

  let path = findDirectivePath(cwd);
  if (!path) {
    mkdirSync(relayConfigDir(), { recursive: true });
    path = join(relayConfigDir(), "router.yaml");
    if (!existsSync(path)) {
      writeFileSync(path, EMBEDDED_ROUTER_YAML, "utf8");
    }
  }

  const doc = parseDocument(readFileSync(path, "utf8"));
  for (const s of suggestions) {
    const candidate = doc.createNode({ backend: s.backend, model: s.model });
    (candidate as { flow?: boolean }).flow = true;
    const node = doc.getIn(["tiers", s.tier], true);
    if (isSeq(node)) {
      node.items.unshift(candidate);
    } else if (node) {
      const seq = new YAMLSeq();
      seq.items.push(candidate, node);
      doc.setIn(["tiers", s.tier], seq);
    }
  }
  writeFileSync(path, doc.toString(), "utf8");
  return `updated ${path} (${suggestions.length} tier(s)) — review with git diff or your editor`;
}

/** CLI entry: gather inputs, suggest, optionally apply. */
export function runAdvise(cwd: string, apply: boolean): string {
  const directive = loadDirective(cwd);
  const { catalog, source } = loadCatalog();
  const suggestions = adviseTiers(
    directive,
    catalog,
    availableBackends(),
    modelStats(),
  );
  const out = [
    formatSuggestions(suggestions),
    `(catalog: ${source}, updated ${catalog.updated})`,
  ];
  if (apply && suggestions.length > 0) {
    out.push(applySuggestions(cwd, suggestions));
  }
  return out.join("\n");
}
