import type { Brief } from "../brief.ts";
import {
  estimateTokensFromText,
  type Backend,
  type BackendResult,
  type BackendRunOpts,
  type DoctorReport,
} from "./types.ts";
import { renderBriefPrompt } from "../brief.ts";

/**
 * Deterministic backend for CI. Echoes a stream-json result and optionally
 * "edits" a marker file when RELAY_FAKE_WRITE is set.
 */
export class FakeBackend implements Backend {
  name = "fake";
  failTimes: number;

  constructor(opts: { failTimes?: number } = {}) {
    this.failTimes = opts.failTimes ?? 0;
  }

  async run(brief: Brief, opts: BackendRunOpts): Promise<BackendResult> {
    if (this.failTimes > 0) {
      this.failTimes -= 1;
      return {
        output: JSON.stringify({ type: "result", error: "fake failure" }),
        filesChanged: [],
        usage: { tokensIn: 10, tokensOut: 5, estimated: false },
        exitCode: 1,
      };
    }

    const prompt = renderBriefPrompt(brief);
    const filesChanged: string[] = [];
    if (process.env.RELAY_FAKE_WRITE) {
      const raw = process.env.RELAY_FAKE_WRITE;
      // relative paths land in the run's cwd, so worktree-lane tests write
      // inside the worktree like a real backend would
      const path = raw.startsWith("/") ? raw : `${opts.cwd}/${raw}`;
      await Bun.write(path, `fake edit for: ${brief.goal}\n`);
      filesChanged.push(path);
    }

    const result = {
      type: "result",
      model: opts.model,
      usage: { input_tokens: 100, output_tokens: 50 },
      result: `ok: ${brief.goal}`,
    };
    const output = JSON.stringify(result) + "\n";
    return {
      output,
      filesChanged,
      usage: {
        tokensIn: 100,
        tokensOut: 50,
        estimated: false,
      },
      exitCode: 0,
    };
  }

  async doctor(): Promise<DoctorReport> {
    return {
      backend: this.name,
      present: true,
      authed: true,
      modelsListable: true,
      message: "fake backend always available (test only)",
    };
  }
}

export function fakeUsageFromPrompt(prompt: string) {
  return {
    tokensIn: estimateTokensFromText(prompt),
    tokensOut: 50,
    estimated: true as const,
  };
}
