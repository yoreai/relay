import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isSeq, parseDocument, YAMLSeq } from "yaml";
import { availableBackends } from "./backends/index.ts";
import { opencodeCatalogId } from "./backends/cli.ts";
import {
  blendedCost,
  blendedCostVia,
  loadCatalog,
  type Catalog,
  type CatalogModel,
} from "./catalog.ts";
import {
  loadDirective,
  resolveTier,
  type Directive,
  type ResolvedTier,
  type TierSpec,
} from "./directive.ts";
import { EMBEDDED_ROUTER_YAML } from "./embedded_defaults.ts";
import { findDirectivePath, relayConfigDir } from "./paths.ts";
import { modelStats, type ModelStats } from "./runlog.ts";
import { servableModels, servablePredicate } from "./servable.ts";

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
   * "available" — display-only: an installed multi-provider CLI can serve this
   * through the user's own provider login. Never auto-applied (see `pin`) —
   * routing policy belongs to the user.
   */
  kind: "cheaper" | "supersedes" | "available";
  evidence?: string;
  /** the exact router.yaml candidate line an "available" nudge proposes */
  pin?: string;
};

/**
 * The cheapest available model that declares it supersedes `currentId`, at no
 * more than the current price. Costing no more is the guard that keeps
 * `supersedes` a fact about replacement rather than a licence to upsell.
 */
function findSuccessor(
  currentId: string,
  currentEntry: CatalogModel,
  currentBackend: string,
  catalog: Catalog,
  available: Set<string>,
): { id: string; backend: string; cost: number } | null {
  const currentCost = blendedCostVia(currentEntry, currentBackend);
  let best: { id: string; backend: string; cost: number } | null = null;

  for (const [id, m] of Object.entries(catalog.models)) {
    if (id === currentId) continue;
    if (!m.supersedes?.includes(currentId)) continue;
    if (currentEntry.fast && !m.fast) continue;
    const backend = m.backends.find((b) => available.has(b));
    if (!backend) continue;
    const cost = blendedCostVia(m, backend);
    if (cost > currentCost) continue;
    if (!best || cost < best.cost) best = { id, backend, cost };
  }

  return best;
}

/**
 * Catalog models reachable through opencode: catalog id → the probed servable
 * id that reaches it. A zen (`opencode/…`) id wins ties — its pin round-trips
 * through the id map instead of riding the passthrough.
 */
function opencodeReachable(
  servable: Set<string>,
  catalog: Catalog,
): Map<string, string> {
  const reachable = new Map<string, string>();
  for (const id of servable) {
    const catalogId = opencodeCatalogId(id);
    if (!catalogId || !catalog.models[catalogId]) continue;
    const prev = reachable.get(catalogId);
    if (!prev || id.startsWith("opencode/")) reachable.set(catalogId, id);
  }
  return reachable;
}

/**
 * Installed ≠ servable for multi-provider CLIs: an opencode without zen
 * billing still answers `which opencode`, yet every shipped zen fallback
 * would fail at runtime. When the probe returned real data, name the cheapest
 * same-class model the user's own provider logins can actually serve. Relay
 * proposes, the human pins — `--apply` never touches these.
 */
function availabilityNudge(
  tierName: string,
  current: ResolvedTier,
  currentEntry: CatalogModel,
  candidates: readonly TierSpec[],
  catalog: Catalog,
  reachable: ReadonlyMap<string, string>,
): TierSuggestion | null {
  const pinned = new Set(candidates.map((c) => c.model));
  let best: { id: string; probedId: string; cost: number } | null = null;
  for (const [id, probedId] of reachable) {
    const m = catalog.models[id]!;
    if (m.class !== currentEntry.class) continue;
    // never trade a latency-optimized tier for a slow model — same guard the
    // cheaper-rule uses, or the fast tier would get nudged toward grok-4.5
    if (currentEntry.fast && !m.fast) continue;
    if (pinned.has(id)) continue;
    const cost = blendedCostVia(m, "opencode");
    if (!best || cost < best.cost) best = { id, probedId, cost };
  }
  if (!best) return null;

  const provider = best.probedId.split("/")[0]!;
  const zen = provider === "opencode";
  return {
    tier: tierName,
    currentBackend: current.backend,
    currentModel: current.model,
    currentCost: blendedCostVia(currentEntry, current.backend),
    backend: "opencode",
    model: best.id,
    cost: best.cost,
    class: currentEntry.class,
    savingsPct: 0,
    kind: "available",
    evidence: `via your ${zen ? "zen" : provider} login`,
    // Zen ids round-trip through opencodeModelId, so the pin stays canonical;
    // a foreign provider must be pinned verbatim (the passthrough path).
    pin: `- { backend: opencode, model: ${zen ? best.id : best.probedId} }`,
  };
}

/**
 * Pure suggestion engine: for each tier, propose either the successor to a
 * superseded pick (free upgrade) or the cheapest catalog model in the SAME
 * quality class, available on an installed backend, that is at least 20%
 * cheaper (blended) than what the tier resolves to today.
 * Facts propose; the user's directive stays untouched unless --apply.
 *
 * With a servable probe result, tier resolution matches what a run would
 * pick, and a tier that yields neither suggestion gets an "available" nudge
 * instead — installed ≠ servable for multi-provider CLIs, so a same-class
 * model the user's own provider login can serve is worth naming even when it
 * saves nothing. Display-only: relay proposes, the human pins.
 */
export function adviseTiers(
  directive: Directive,
  catalog: Catalog,
  available: Set<string>,
  stats: ModelStats = {},
  servable?: Set<string> | null,
): TierSuggestion[] {
  const suggestions: TierSuggestion[] = [];
  // Catalog models reachable via the user's opencode logins, or null when
  // there is nothing to nudge with (no probe result / opencode not installed).
  const reachable =
    servable && available.has("opencode")
      ? opencodeReachable(servable, catalog)
      : null;

  for (const tierName of Object.keys(directive.tiers)) {
    let current;
    try {
      current = resolveTier(
        directive,
        tierName,
        available,
        servablePredicate(servable ?? null),
      );
    } catch {
      continue; // no backend for this tier at all — doctor's problem, not advise's
    }

    const currentEntry = catalog.models[current.model];
    if (!currentEntry) continue; // unknown model — nothing to compare against
    const currentCost = blendedCostVia(currentEntry, current.backend);

    // A successor at no extra cost wins outright: price-only advice would stay
    // silent here (nothing is saved), yet running the superseded model is
    // simply worse. Applying it re-resolves the tier, so a later `advise` can
    // still propose a cheaper same-class pick on top.
    const successor = findSuccessor(
      current.model,
      currentEntry,
      current.backend,
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
      const cost = blendedCostVia(m, backend);
      if (cost >= currentCost * 0.8) continue; // demand a real (20%+) saving
      if (!best || cost < best.cost) best = { id, backend, cost };
    }

    // A tier that already produced a suggestion gets no nudge — availability
    // only fills silence.
    if (!best) {
      const nudge = reachable
        ? availabilityNudge(
            tierName,
            current,
            currentEntry,
            directive.tiers[tierName]!,
            catalog,
            reachable,
          )
        : null;
      if (nudge) suggestions.push(nudge);
      continue;
    }

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
    if (s.kind === "available") {
      lines.push(
        `  ${s.tier.padEnd(7)} ${s.model} available via opencode (${s.evidence}) — add: ${s.pin}`,
      );
      continue;
    }
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
  if (suggestions.some((s) => s.kind === "available")) {
    lines.push(
      "availability suggestions are never auto-applied — add the line to your router.yaml to opt in",
    );
  }
  return lines.join("\n");
}

/**
 * Prepend each suggestion as the first fallback candidate in the user's
 * router.yaml (comment-preserving edit). Creates ~/.config/relay/router.yaml
 * from the embedded default if no directive file exists yet.
 * "available" nudges are skipped — display-only, the user pins them by hand.
 */
export function applySuggestions(
  cwd: string,
  suggestions: TierSuggestion[],
): string {
  // Adding a candidate is a policy decision, and routing policy belongs to
  // the user — availability nudges are never auto-applied.
  const applicable = suggestions.filter((s) => s.kind !== "available");
  const note =
    applicable.length < suggestions.length
      ? " (availability suggestions skipped — add them manually to opt in)"
      : "";
  if (applicable.length === 0) return `nothing to apply${note}`;

  let path = findDirectivePath(cwd);
  if (!path) {
    mkdirSync(relayConfigDir(), { recursive: true });
    path = join(relayConfigDir(), "router.yaml");
    if (!existsSync(path)) {
      writeFileSync(path, EMBEDDED_ROUTER_YAML, "utf8");
    }
  }

  const doc = parseDocument(readFileSync(path, "utf8"));
  for (const s of applicable) {
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
  return (
    `updated ${path} (${applicable.length} tier(s)) — review with git diff or your editor` +
    note
  );
}

/** CLI entry: gather inputs, suggest, optionally apply. */
export async function runAdvise(cwd: string, apply: boolean): Promise<string> {
  const directive = loadDirective(cwd);
  const { catalog, source } = loadCatalog();
  const available = availableBackends();
  // Installed ≠ servable for multi-provider CLIs. The probe is 24h-cached and
  // fail-open, so null (or no opencode) leaves advise exactly as before.
  const servable = available.has("opencode")
    ? await servableModels("opencode")
    : null;
  const suggestions = adviseTiers(
    directive,
    catalog,
    available,
    modelStats(),
    servable,
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
