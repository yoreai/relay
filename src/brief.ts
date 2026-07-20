import { z } from "zod";

export const BriefSchema = z.object({
  goal: z.string().min(1),
  why: z.string().optional(),
  files: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  done_means: z.array(z.string()).default([]),
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

export function renderBriefPrompt(brief: Brief): string {
  const parts: string[] = [`Goal: ${brief.goal}`];
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
