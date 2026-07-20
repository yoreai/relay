import type { Brief } from "./brief.ts";
import type { Directive, Lane } from "./directive.ts";
import { findLane } from "./directive.ts";

export type RouteDecision = {
  lane: Lane;
  tier: string;
  reason: string;
  confidence: "high" | "medium" | "low";
};

const WORD_RE = /[a-z0-9][a-z0-9_-]*/gi;

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(WORD_RE) ?? []).map((w) => w.toLowerCase());
}

function verbHit(tokens: Set<string>, verbs: string[]): string | null {
  for (const v of verbs) {
    const needle = v.toLowerCase();
    if (tokens.has(needle)) return needle;
    // multiword verbs like "add-test" / "root-cause"
    if (needle.includes("-")) {
      const parts = needle.split("-");
      if (parts.every((p) => tokens.has(p))) return needle;
    }
  }
  return null;
}

/**
 * Rules-first router. Classifier hook is reserved — for v1 we fall back to
 * default_lane when no verb matches (cheap, deterministic).
 */
export function routeTask(
  directive: Directive,
  task: string,
  opts: {
    lane?: string;
    tier?: string;
    brief?: Brief;
    walkaway?: boolean;
  } = {},
): RouteDecision {
  if (opts.lane) {
    const lane = findLane(directive, opts.lane);
    const tier = opts.tier ?? lane.tier;
    return {
      lane,
      tier,
      reason: `forced --lane ${lane.name}`,
      confidence: "high",
    };
  }

  const tokens = new Set(tokenize(task));
  const fileCount = opts.brief?.files?.length ?? 0;
  const walkaway = opts.walkaway === true || /\bwalkaway\b/i.test(task);

  let best: { lane: Lane; verb: string; score: number } | null = null;

  for (const lane of directive.lanes) {
    const hit = verbHit(tokens, lane.match.verbs);
    if (!hit) continue;

    let score = 10;
    if (lane.match.walkaway) {
      if (walkaway) score += 5;
      else score -= 2;
    }
    if (lane.match.max_files != null && fileCount > 0) {
      if (fileCount <= lane.match.max_files) score += 2;
      else score -= 3;
    }
    if (!best || score > best.score) {
      best = { lane, verb: hit, score };
    }
  }

  if (best && best.score > 0) {
    return {
      lane: best.lane,
      tier: opts.tier ?? best.lane.tier,
      reason: `verb "${best.verb}" → lane ${best.lane.name}`,
      confidence: best.score >= 10 ? "high" : "medium",
    };
  }

  const lane = findLane(directive, directive.default_lane);
  return {
    lane,
    tier: opts.tier ?? lane.tier,
    reason: `no confident match → default_lane ${lane.name}`,
    confidence: "low",
  };
}
