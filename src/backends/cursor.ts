import { which } from "../which.ts";
import type { Brief } from "../brief.ts";
import { renderBriefPrompt } from "../brief.ts";
import {
  estimateTokensFromText,
  type Backend,
  type BackendResult,
  type BackendRunOpts,
  type DoctorReport,
} from "./types.ts";

function discoverCursorBinary(override?: string): string | null {
  if (override) return which(override) ? override : null;
  const env = process.env.RELAY_CURSOR_BIN;
  if (env && which(env)) return env;
  for (const name of ["cursor-agent", "agent"]) {
    if (which(name)) return name;
  }
  return null;
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
      opts.model,
      "--output-format",
      "stream-json",
      "--force",
    ];
    if (opts.effort) {
      // feature-detect friendly: pass only if set; CLI may ignore unknown
      args.push("--effort", opts.effort);
    }

    const proc = Bun.spawn([bin, ...args], {
      cwd: opts.cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    const output = stdout || stderr;
    const filesChanged = parseChangedFiles(stdout);
    const tokensIn = estimateTokensFromText(prompt);
    const tokensOut = estimateTokensFromText(output);

    return {
      output,
      filesChanged,
      usage: { tokensIn, tokensOut, estimated: true },
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
    return {
      backend: this.name,
      present: true,
      binary: bin,
      authed: "unknown",
      modelsListable: false,
      message: `found ${bin} (auth not probed; run \`${bin} login\` if calls fail)`,
      fix: `${bin} login`,
    };
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
