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
  // Only an explicit request counts. Reading the word "walkaway" out of the
  // task text made the branch/commit/push/PR path reachable from prose that
  // relay does not control — an MCP caller's task string is written by another
  // agent, so a lane that spends the user's git credentials must be asked for
  // through the flag or the MCP field, not mentioned in passing.
  const walkaway = opts.walkaway === true;

  let best: { lane: Lane; verb: string; score: number } | null = null;

  for (const lane of directive.lanes) {
    // Walkaway lanes (worktree + draft PR) are strictly opt-in: without an
    // explicit walkaway request, "implement X" must land in a staged-edit
    // lane, never silently in the worktree machinery.
    if (lane.match.walkaway && !walkaway) continue;

    const hit = verbHit(tokens, lane.match.verbs);
    if (!hit) continue;

    let score = 10;
    if (lane.match.walkaway && walkaway) score += 5;
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
  // The opt-in check above guards the matching loop only, so a default_lane
  // pointing at a walkaway lane used to reach the worktree machinery with no
  // opt-in at all — every unmatched task branching, committing and opening a PR
  // with the user's credentials. Unrequested walkaway keeps the lane's routing
  // but lands the edits in the working tree, where they're reviewable.
  if (lane.match.walkaway && !walkaway && lane.write === "worktree") {
    return {
      lane: { ...lane, write: "tree" },
      tier: opts.tier ?? lane.tier,
      reason:
        `no confident match → default_lane ${lane.name} ` +
        `(walkaway not requested → edits stay in the working tree)`,
      confidence: "low",
    };
  }
  return {
    lane,
    tier: opts.tier ?? lane.tier,
    reason: `no confident match → default_lane ${lane.name}`,
    confidence: "low",
  };
}
