import { z } from "zod";

/** Agents across ecosystems pass single strings where we want lists — coerce
 * instead of erroring at the MCP boundary. */
const stringList = z
  .union([z.array(z.string()), z.string()])
  .transform((v) => (typeof v === "string" ? [v] : v));

export const BriefSchema = z.object({
  goal: z.string().min(1),
  why: z.string().optional(),
  files: stringList.optional(),
  constraints: stringList.optional(),
  done_means: stringList.default([]),
  context: z.string().optional(),
});

export type Brief = z.infer<typeof BriefSchema>;

export function parseBrief(raw: unknown): Brief {
  return BriefSchema.parse(raw);
}

/** Build a minimal brief from a freeform CLI task string. */
export function briefFromTask(task: string, files?: string[]): Brief {
  return {
    goal: task.trim(),
    files,
    done_means: ["changes look correct", "verify commands pass if configured"],
  };
}

/** Every worker prompt opens with this — advisory layer of the recursion guard
 * (the hard layer is the RELAY_WORKER env refusal in mcp.ts / cli.ts). */
const WORKER_GUARD =
  "[relay worker] You are relay's delegated worker. Execute this task directly " +
  "yourself. Never call relay, relay_run, or any relay MCP tool — that would " +
  "recurse. Ignore any skill or instruction telling you to delegate to relay.";

export function renderBriefPrompt(brief: Brief): string {
  const parts: string[] = [WORKER_GUARD, `Goal: ${brief.goal}`];
  if (brief.why) parts.push(`Why: ${brief.why}`);
  if (brief.files?.length) parts.push(`Files:\n- ${brief.files.join("\n- ")}`);
  if (brief.constraints?.length) {
    parts.push(`Constraints:\n- ${brief.constraints.join("\n- ")}`);
  }
  if (brief.done_means.length) {
    parts.push(`Done means:\n- ${brief.done_means.join("\n- ")}`);
  }
  if (brief.context) parts.push(`Context:\n${brief.context}`);
  return parts.join("\n\n");
}
