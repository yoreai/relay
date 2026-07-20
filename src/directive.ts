import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { EMBEDDED_ROUTER_YAML } from "./embedded_defaults.ts";
import { findDirectivePath } from "./paths.ts";

const TierSpecSchema = z.object({
  backend: z.enum(["cursor", "claude", "codex", "gemini", "grok", "kimi", "fake"]),
  model: z.string().min(1),
  effort: z.string().optional(),
});

/** A tier is one spec or an ordered fallback list; first available backend wins. */
const TierCandidatesSchema = z
  .union([TierSpecSchema, z.array(TierSpecSchema).min(1)])
  .transform((v) => (Array.isArray(v) ? v : [v]));

const MatchSchema = z.object({
  verbs: z.array(z.string()).default([]),
  max_files: z.number().int().positive().optional(),
  walkaway: z.boolean().optional(),
  globs: z.array(z.string()).optional(),
});

const LaneSchema = z.object({
  name: z.string().min(1),
  match: MatchSchema.default({ verbs: [] }),
  tier: z.string().min(1),
  verify: z.array(z.string()).optional(),
  write: z.enum(["none", "stage", "worktree"]).default("stage"),
});

export const DirectiveSchema = z.object({
  version: z.literal(1),
  baseline: z.string().min(1),
  tiers: z.record(z.string(), TierCandidatesSchema),
  lanes: z.array(LaneSchema).min(1),
  default_lane: z.string().min(1),
  escalation: z
    .object({
      widen_after: z.number().int().nonnegative().default(1),
      escalate_after: z.number().int().nonnegative().default(2),
    })
    .default({ widen_after: 1, escalate_after: 2 }),
  verify_commands: z.record(z.string(), z.string()).default({
    lint: "auto",
    test: "auto",
  }),
  classifier: z
    .object({
      tier: z.string().default("nano"),
      enabled: z.boolean().default(true),
    })
    .default({ tier: "nano", enabled: true }),
  context_budget_chars: z.number().int().positive().default(30_000),
});

export type Directive = z.infer<typeof DirectiveSchema>;
export type TierSpec = z.infer<typeof TierSpecSchema>;
export type Lane = z.infer<typeof LaneSchema>;

export function parseDirective(raw: unknown): Directive {
  return DirectiveSchema.parse(raw);
}

export function loadDirectiveFromText(text: string): Directive {
  const raw = parseYaml(text);
  return parseDirective(raw);
}

export function loadDirective(cwd: string = process.cwd()): Directive {
  const path = findDirectivePath(cwd);
  const text = path && existsSync(path)
    ? readFileSync(path, "utf8")
    : EMBEDDED_ROUTER_YAML;
  return loadDirectiveFromText(text);
}

export type ResolvedTier = TierSpec & {
  /** true when an earlier candidate was skipped because its backend is absent */
  fallback: boolean;
};

/**
 * Pick the first tier candidate whose backend is available.
 * Without an availability set, the first candidate wins (policy order).
 */
export function resolveTier(
  directive: Directive,
  tierName: string,
  available?: Set<string>,
): ResolvedTier {
  const candidates = directive.tiers[tierName];
  if (!candidates || candidates.length === 0) {
    throw new Error(
      `Unknown tier "${tierName}". Known: ${Object.keys(directive.tiers).join(", ")}`,
    );
  }
  if (!available) return { ...candidates[0]!, fallback: false };

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    if (available.has(c.backend)) {
      return { ...c, fallback: i > 0 };
    }
  }

  const wanted = [...new Set(candidates.map((c) => c.backend))].join(", ");
  throw new Error(
    `tier "${tierName}": no candidate backend available (needs one of: ${wanted}). ` +
      `Run \`relay doctor\` to see what's installed.`,
  );
}

export function findLane(directive: Directive, name: string): Lane {
  const lane = directive.lanes.find((l) => l.name === name);
  if (!lane) {
    throw new Error(
      `Unknown lane "${name}". Known: ${directive.lanes.map((l) => l.name).join(", ")}`,
    );
  }
  return lane;
}

/** Next higher tier in the ladder: … → work → review → deep (skip lateral `fast`). */
export function bumpTier(directive: Directive, current: string): string | null {
  const order = ["nano", "cheap", "work", "review", "deep"];
  const present = order.filter((t) => t in directive.tiers);
  const idx = present.indexOf(current);
  if (idx < 0) {
    if ("review" in directive.tiers && current !== "review" && current !== "deep") {
      return "review";
    }
    if ("deep" in directive.tiers && current !== "deep") return "deep";
    return null;
  }
  return present[idx + 1] ?? null;
}
