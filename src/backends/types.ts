import type { Brief } from "../brief.ts";

export type Usage = {
  tokensIn?: number;
  tokensOut?: number;
  /** cache-read tokens — often dominate agentic runs, billed at a cheaper rate */
  tokensCacheRead?: number;
  estimated: boolean;
};

export type BackendResult = {
  output: string;
  filesChanged: string[];
  usage?: Usage;
  exitCode: number;
  sessionId?: string;
};

export type BackendRunOpts = {
  cwd: string;
  model: string;
  effort?: string;
  /**
   * Lane write mode. Backends may translate this into their narrowest
   * edit-permission flag (e.g. claude --permission-mode acceptEdits) —
   * never into blanket permission bypasses.
   */
  write?: "none" | "tree" | "worktree";
  /** Injected binary override (tests / config). */
  binary?: string;
  signal?: AbortSignal;
};

export interface Backend {
  name: string;
  run(brief: Brief, opts: BackendRunOpts): Promise<BackendResult>;
  doctor(): Promise<DoctorReport>;
}

export type DoctorReport = {
  backend: string;
  present: boolean;
  binary?: string;
  authed?: boolean | "unknown";
  modelsListable?: boolean;
  message: string;
  fix?: string;
};

export function estimateTokensFromText(text: string, bytesPerToken = 4): number {
  const bytes = new TextEncoder().encode(text).length;
  return Math.max(1, Math.ceil(bytes / bytesPerToken));
}

/**
 * Pull real token usage out of a stream-json transcript (cursor-agent and
 * claude both emit a final `result` event with usage). Scans from the end.
 * Field names vary per CLI: cursor uses inputTokens/outputTokens/
 * cacheReadTokens, claude uses input_tokens/output_tokens/
 * cache_read_input_tokens.
 */
export function parseStreamUsage(streamJson: string): Usage | null {
  for (const line of streamJson.split("\n").reverse()) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const evt = JSON.parse(t) as {
        usage?: Record<string, number>;
        result?: { usage?: Record<string, number> };
        message?: { usage?: Record<string, number> };
      };
      const u = evt.usage ?? evt.result?.usage ?? evt.message?.usage;
      if (!u) continue;
      const tokensIn = u.input_tokens ?? u.inputTokens ?? 0;
      const tokensOut = u.output_tokens ?? u.outputTokens ?? 0;
      const cacheRead =
        u.cache_read_input_tokens ?? u.cacheReadTokens ?? u.cache_read_tokens ?? 0;
      if (tokensIn || tokensOut) {
        return {
          tokensIn,
          tokensOut,
          tokensCacheRead: cacheRead || undefined,
          estimated: false,
        };
      }
    } catch {
      // keep scanning
    }
  }
  return null;
}

/**
 * Assistant-visible text from a stream-json transcript. Used as the
 * estimation fallback: estimating from the raw stream counts every event
 * envelope and tool payload and inflates output ~10x.
 */
export function assistantTextFromStream(streamJson: string): string {
  const parts: string[] = [];
  for (const line of streamJson.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const evt = JSON.parse(t) as {
        type?: string;
        message?: { content?: unknown };
      };
      if (evt.type !== "assistant") continue;
      const content = evt.message?.content;
      if (typeof content === "string") parts.push(content);
      else if (Array.isArray(content)) {
        for (const c of content) {
          if (c && typeof c === "object" && (c as { type?: string }).type === "text") {
            const text = (c as { text?: unknown }).text;
            if (typeof text === "string") parts.push(text);
          }
        }
      }
    } catch {
      // ignore non-json lines
    }
  }
  return parts.join("\n");
}
