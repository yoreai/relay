import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Brief } from "../brief.ts";
import { pullBeadsContext } from "./beads.ts";

export type AssembleOpts = {
  cwd: string;
  budgetChars: number;
  widen?: boolean;
  namedFiles?: string[];
};

export async function assembleContext(
  brief: Brief,
  opts: AssembleOpts,
): Promise<string> {
  // MCP callers pass curated brief.context — pass through, maybe pad lightly
  if (brief.context && brief.context.trim().length > 0 && !opts.widen) {
    return trimToBudget(brief.context, opts.budgetChars);
  }

  const chunks: string[] = [];

  const agents = readAgentsMd(opts.cwd);
  if (agents) chunks.push(`## AGENTS.md\n${agents}`);

  const git = await gitSnapshot(opts.cwd, opts.widen === true);
  if (git) chunks.push(git);

  const files = opts.namedFiles ?? brief.files ?? [];
  for (const f of files.slice(0, opts.widen ? 20 : 8)) {
    const abs = join(opts.cwd, f);
    if (!existsSync(abs)) continue;
    try {
      const text = readFileSync(abs, "utf8");
      const slice = text.slice(0, opts.widen ? 6_000 : 2_500);
      chunks.push(`## file: ${f}\n\`\`\`\n${slice}\n\`\`\``);
    } catch {
      // skip unreadable
    }
  }

  const beads = await pullBeadsContext(opts.cwd);
  if (beads) chunks.push(beads);

  if (brief.context) chunks.unshift(`## caller context\n${brief.context}`);

  return trimToBudget(chunks.join("\n\n"), opts.budgetChars);
}

function readAgentsMd(cwd: string): string | null {
  for (const name of ["AGENTS.md", "agents.md", "CLAUDE.md"]) {
    const p = join(cwd, name);
    if (existsSync(p)) {
      try {
        return readFileSync(p, "utf8").slice(0, 4_000);
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function gitSnapshot(cwd: string, wide: boolean): Promise<string | null> {
  try {
    const status = await runGit(cwd, ["status", "--short"]);
    const diff = await runGit(cwd, [
      "diff",
      "--stat",
      ...(wide ? [] : ["--", ".", ":(exclude)node_modules", ":(exclude)dist"]),
    ]);
    const head = await runGit(cwd, ["log", "-1", "--oneline"]);
    if (!status && !diff) return null;
    const body = [
      "## git",
      head ? `HEAD: ${head}` : null,
      status ? `status:\n${status}` : null,
      diff ? `diff --stat:\n${diff.slice(0, wide ? 4_000 : 1_500)}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    return body;
  } catch {
    return null;
  }
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) return "";
  return stdout.trim();
}

function trimToBudget(text: string, budget: number): string {
  if (text.length <= budget) return text;
  return text.slice(0, budget - 20) + "\n\n…[truncated]";
}
