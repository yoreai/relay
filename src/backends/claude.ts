import { which } from "../which.ts";
import type { Brief } from "../brief.ts";
import { renderBriefPrompt } from "../brief.ts";
import { runCli } from "./spawn.ts";
import {
  assistantTextFromStream,
  estimateTokensFromText,
  parseStreamUsage,
  type Backend,
  type BackendResult,
  type BackendRunOpts,
  type DoctorReport,
} from "./types.ts";

/**
 * The claude CLI resolves model ALIASES (sonnet/haiku/opus), not the
 * canonical catalog ids relay uses for pricing. Map what we know; pass
 * unknown ids through so users can pin exact model strings.
 */
export function claudeModelId(canonical: string): string {
  const map: Record<string, string> = {
    "sonnet-5": "sonnet",
    "haiku-4.5": "haiku",
    "opus-4.8-high": "opus",
    "fable-5-high": "opus", // best claude-served tier until fable alias confirmed
  };
  return map[canonical] ?? canonical;
}

export function discoverClaudeBinary(override?: string): string | null {
  if (override) return which(override) ? override : null;
  const env = process.env.RELAY_CLAUDE_BIN;
  if (env && which(env)) return env;
  if (which("claude")) return "claude";
  return null;
}

export class ClaudeBackend implements Backend {
  name = "claude";

  async run(brief: Brief, opts: BackendRunOpts): Promise<BackendResult> {
    const bin = discoverClaudeBinary(opts.binary);
    if (!bin) {
      throw new Error(
        "claude backend: `claude` not found on PATH. Run `relay doctor`.",
      );
    }

    const prompt = renderBriefPrompt(brief, opts.write);
    const args = [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--model",
      claudeModelId(opts.model),
    ];
    if (opts.write === "tree" || opts.write === "worktree") {
      // narrowest flag that lets the lane do its job: file edits only,
      // still NOT --dangerously-skip-permissions
      args.push("--permission-mode", "acceptEdits");
    }

    const { stdout, stderr, exitCode } = await runCli([bin, ...args], {
      cwd: opts.cwd,
    });

    const output = stdout || stderr;
    const usage = parseStreamUsage(stdout) ?? {
      tokensIn: estimateTokensFromText(prompt),
      tokensOut: estimateTokensFromText(assistantTextFromStream(stdout) || output),
      estimated: true,
    };

    return {
      output,
      filesChanged: [],
      usage,
      exitCode,
    };
  }

  async doctor(): Promise<DoctorReport> {
    const bin = discoverClaudeBinary();
    if (!bin) {
      return {
        backend: this.name,
        present: false,
        message: "claude not found on PATH",
        fix: "Install Claude Code CLI, then complete its OAuth/login flow",
      };
    }
    return {
      backend: this.name,
      present: true,
      binary: bin,
      authed: "unknown",
      modelsListable: false,
      message: `found ${bin} (auth owned by Claude CLI; relay stores no credentials)`,
    };
  }
}
