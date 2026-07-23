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

export function discoverCursorBinary(override?: string): string | null {
  if (override) return which(override) ? override : null;
  const env = process.env.RELAY_CURSOR_BIN;
  if (env && which(env)) return env;
  for (const name of ["cursor-agent", "agent"]) {
    if (which(name)) return name;
  }
  return null;
}

/**
 * cursor-agent encodes effort in the model id itself (verified against the
 * CLI's own "Available models" list): `cursor-grok-4.5-medium`,
 * `gpt-5.6-luna-low`, `claude-fable-5-high`… Map relay's canonical catalog
 * ids; unknown ids pass through so users can pin exact cursor ids.
 */
export function cursorModelId(canonical: string, effort?: string): string {
  const e = effort ?? "medium";
  const map: Record<string, string> = {
    "gpt-5.6-luna": `gpt-5.6-luna-${e}`,
    "gpt-5.6-sol": `gpt-5.6-sol-${e}`,
    "grok-4.5": `cursor-grok-4.5-${e}`,
    "grok-4.5-fast": `cursor-grok-4.5-${e}-fast`,
    "glm-5.2": "glm-5.2-high",
    "sonnet-5": `claude-sonnet-5-${e}`,
    "opus-4.8-high": "claude-opus-4-8-high",
    "fable-5-high": "claude-fable-5-high",
    "gemini-3.1-pro": "gemini-3.1-pro",
  };
  return map[canonical] ?? canonical;
}

export class CursorBackend implements Backend {
  name = "cursor";

  async run(brief: Brief, opts: BackendRunOpts): Promise<BackendResult> {
    const bin = discoverCursorBinary(opts.binary);
    if (!bin) {
      throw new Error(
        "cursor backend: neither `cursor-agent` nor `agent` found on PATH. Run `relay doctor`.",
      );
    }

    const prompt = renderBriefPrompt(brief);
    const args = [
      "-p",
      prompt,
      "--model",
      cursorModelId(opts.model, opts.effort),
      "--output-format",
      "stream-json",
      "--force",
    ];

    const { stdout, stderr, exitCode } = await runCli([bin, ...args], {
      cwd: opts.cwd,
    });

    const output = stdout || stderr;
    const filesChanged = parseChangedFiles(stdout);
    // cursor-agent's final result event reports exact usage; only fall back
    // to byte-estimation (over assistant text, not the raw event stream)
    // when the transcript is missing it
    const usage = parseStreamUsage(stdout) ?? {
      tokensIn: estimateTokensFromText(prompt),
      tokensOut: estimateTokensFromText(assistantTextFromStream(stdout) || output),
      estimated: true,
    };

    return {
      output,
      filesChanged,
      usage,
      exitCode,
    };
  }

  async doctor(): Promise<DoctorReport> {
    const bin = discoverCursorBinary();
    if (!bin) {
      return {
        backend: this.name,
        present: false,
        message: "cursor-agent / agent not found on PATH",
        fix: "Install Cursor CLI and ensure `cursor-agent` (or `agent`) is on PATH, then run `cursor-agent login`",
      };
    }
    const authed = await probeCursorAuth(bin);
    return {
      backend: this.name,
      present: true,
      binary: bin,
      authed,
      modelsListable: false,
      message:
        authed === true
          ? `found ${bin} (authenticated)`
          : authed === false
            ? `found ${bin} — NOT authenticated for headless runs`
            : `found ${bin} (auth probe inconclusive)`,
      fix: authed === false ? `${bin} login  (or set CURSOR_API_KEY)` : undefined,
    };
  }
}

/**
 * Headless (-p) mode can require CURSOR_API_KEY even when interactive login
 * succeeded — probe with a tiny real invocation so doctor tells the truth.
 */
export async function probeCursorAuth(bin: string): Promise<boolean | "unknown"> {
  try {
    const proc = Bun.spawn(
      [bin, "-p", "say only: ok", "--model", "gpt-5.6-luna-low", "--output-format", "text"],
      { stdout: "pipe", stderr: "pipe", env: { ...process.env } },
    );
    const timeout = setTimeout(() => proc.kill(), 20_000);
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timeout);
    const text = out + err;
    // Workspace-trust prompt means auth already succeeded — trust is per-repo
    // and real runs pass --force. Don't mistake it for a login failure.
    if (/workspace trust/i.test(text)) return true;
    if (/authentication required|not authenticated|login/i.test(text) && code !== 0) {
      return false;
    }
    return code === 0 && /\bok\b/i.test(text) ? true : "unknown";
  } catch {
    return "unknown";
  }
}

function parseChangedFiles(streamJson: string): string[] {
  const files = new Set<string>();
  for (const line of streamJson.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const evt = JSON.parse(t) as Record<string, unknown>;
      // best-effort: common shapes from agent CLIs
      const candidates = [
        evt.file,
        evt.path,
        (evt as { filename?: string }).filename,
      ];
      for (const c of candidates) {
        if (typeof c === "string" && c.length > 0) files.add(c);
      }
      if (Array.isArray(evt.files)) {
        for (const f of evt.files) {
          if (typeof f === "string") files.add(f);
          else if (f && typeof f === "object" && "path" in f) {
            const p = (f as { path: unknown }).path;
            if (typeof p === "string") files.add(p);
          }
        }
      }
    } catch {
      // ignore non-json lines
    }
  }
  return [...files];
}
