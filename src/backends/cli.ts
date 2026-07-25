import { which } from "../which.ts";
import type { Brief } from "../brief.ts";
import { renderBriefPrompt } from "../brief.ts";
import { runCli } from "./spawn.ts";
import {
  estimateTokensFromText,
  type Backend,
  type BackendResult,
  type BackendRunOpts,
  type DoctorReport,
} from "./types.ts";

/**
 * Spec-driven adapter for headless agent CLIs. Adding a new tool is one
 * entry in SPECS (binary names + arg shape) — no new adapter class.
 * Permission posture (sandbox overrides, auto-approve flags) stays with
 * the user's own tool config; relay never passes dangerous bypass flags.
 */
export type CliBackendSpec = {
  name: string;
  /** binary names probed on PATH, first hit wins */
  binaries: string[];
  /** env var that overrides binary discovery, e.g. RELAY_CODEX_BIN */
  binEnv: string;
  buildArgs: (prompt: string, model: string, effort?: string) => string[];
  /** per-spawn env additions, e.g. kimi's effort passthrough */
  buildEnv?: (effort?: string) => Record<string, string>;
  /** flags verified against a real installation vs best-known/drift-prone */
  verified: boolean;
  loginHint: string;
};

/**
 * The managed kimi-code OAuth service (`kimi login`) serves models under
 * `kimi-code/*` aliases, not the open-platform ids the catalog names
 * (verified 2026-07-25 against kimi-code 0.29.1 via `kimi provider list
 * --json`). Map relay's canonical catalog ids to those aliases — the most
 * pinned handles the service offers: `kimi-code/k3` names a version, but
 * `kimi-for-coding` re-points with new coding releases, so catalog
 * maintenance re-checks this map against what the CLI actually serves.
 * `kimi-k2.6` is NOT on the managed service — open platform only — so it
 * (and any unknown id) passes through: users pin their own provider alias
 * (e.g. `moonshotai/kimi-k2.6`) rather than relay silently substituting one.
 */
export function kimiModelId(canonical: string): string {
  const map: Record<string, string> = {
    "kimi-k2.7-code": "kimi-code/kimi-for-coding",
    "kimi-k2.7-code-highspeed": "kimi-code/kimi-for-coding-highspeed",
    "kimi-k3": "kimi-code/k3",
  };
  return map[canonical] ?? canonical;
}

export const CLI_SPECS: Record<string, CliBackendSpec> = {
  codex: {
    name: "codex",
    binaries: ["codex"],
    binEnv: "RELAY_CODEX_BIN",
    // Verified against codex-cli 0.139: `codex exec [PROMPT] -m MODEL`.
    // workspace-write keeps edits sandboxed to the repo (not a bypass flag).
    // NOTE: codex hangs (rather than erroring) on unknown model ids — the
    // shared spawn timeout converts that into a failover to the next backend.
    buildArgs: (prompt, model) => [
      "exec",
      "--model",
      model,
      "--sandbox",
      "workspace-write",
      prompt,
    ],
    verified: true,
    loginHint: "codex login",
  },
  gemini: {
    name: "gemini",
    binaries: ["gemini"],
    binEnv: "RELAY_GEMINI_BIN",
    buildArgs: (prompt, model) => ["-p", prompt, "-m", model],
    verified: false,
    loginHint: "gemini (first run opens auth)",
  },
  grok: {
    name: "grok",
    binaries: ["grok"],
    binEnv: "RELAY_GROK_BIN",
    buildArgs: (prompt, model) => ["-p", prompt, "--model", model],
    verified: false,
    loginHint: "grok auth login",
  },
  kimi: {
    name: "kimi",
    binaries: ["kimi"],
    binEnv: "RELAY_KIMI_BIN",
    // Verified against kimi-code 0.29.1: `kimi -p PROMPT --model ALIAS`.
    buildArgs: (prompt, model) => ["-p", prompt, "--model", kimiModelId(model)],
    // There is no --effort flag; KIMI_MODEL_THINKING_EFFORT forces
    // thinking.effort on the wire for kimi-type providers (k3 takes
    // low/high/max; boolean-thinking models like k2.7-code treat any enabled
    // value as "on"). Unset, the model alias's own default_effort applies.
    buildEnv: (effort): Record<string, string> =>
      effort ? { KIMI_MODEL_THINKING_EFFORT: effort } : {},
    verified: true,
    loginHint: "kimi login",
  },
};

export function discoverCliBinary(spec: CliBackendSpec): string | null {
  const env = process.env[spec.binEnv];
  if (env && which(env)) return env;
  for (const name of spec.binaries) {
    if (which(name)) return name;
  }
  return null;
}

export class GenericCliBackend implements Backend {
  name: string;
  private spec: CliBackendSpec;

  constructor(spec: CliBackendSpec) {
    this.spec = spec;
    this.name = spec.name;
  }

  async run(brief: Brief, opts: BackendRunOpts): Promise<BackendResult> {
    const bin = opts.binary ?? discoverCliBinary(this.spec);
    if (!bin) {
      throw new Error(
        `${this.name} backend: \`${this.spec.binaries[0]}\` not found on PATH. Run \`relay doctor\`.`,
      );
    }

    const prompt = renderBriefPrompt(brief, opts.write);
    const args = this.spec.buildArgs(prompt, opts.model, opts.effort);
    const { stdout, stderr, exitCode } = await runCli([bin, ...args], {
      cwd: opts.cwd,
      env: {
        ...process.env,
        RELAY_WORKER: "1",
        ...this.spec.buildEnv?.(opts.effort),
      },
    });

    const output = stdout || stderr;
    return {
      output,
      filesChanged: [],
      usage: {
        tokensIn: estimateTokensFromText(prompt),
        tokensOut: estimateTokensFromText(output),
        estimated: true,
      },
      exitCode,
    };
  }

  async doctor(): Promise<DoctorReport> {
    const bin = discoverCliBinary(this.spec);
    if (!bin) {
      return {
        backend: this.name,
        present: false,
        message: `${this.spec.binaries.join(" / ")} not found on PATH`,
        fix: `install the ${this.name} CLI, then: ${this.spec.loginHint}`,
      };
    }
    return {
      backend: this.name,
      present: true,
      binary: bin,
      authed: "unknown",
      modelsListable: false,
      message:
        `found ${bin}` +
        (this.spec.verified
          ? ""
          : " (experimental adapter — flags unverified, report issues)"),
    };
  }
}
