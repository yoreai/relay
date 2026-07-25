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
  /** flags verified against a real installation vs best-known/drift-prone */
  verified: boolean;
  loginHint: string;
};

/**
 * Headless opencode requires a `provider/model` id, so relay maps its
 * canonical catalog ids to the pinned ids of opencode's built-in `zen`
 * provider (verified 2026-07-25 against opencode 1.18.5). Zen names the
 * claude family with a `claude-` prefix (`opencode/claude-opus-5`) while
 * other models match the catalog ids verbatim (`opencode/glm-5.2`). `-high`
 * effort suffixes are dropped — relay does not wire effort for opencode, so
 * the provider's own default applies. Unknown ids pass through so users can
 * pin their own provider/model (e.g. `openai/gpt-5.6-sol`) rather than
 * relay silently substituting one.
 */
export function opencodeModelId(canonical: string): string {
  const map: Record<string, string> = {
    "gpt-5.6-luna": "opencode/gpt-5.6-luna",
    "gemini-3-flash": "opencode/gemini-3-flash",
    "glm-5.2": "opencode/glm-5.2",
    "grok-4.5": "opencode/grok-4.5",
    "gemini-3.1-pro": "opencode/gemini-3.1-pro",
    "gpt-5.6-sol": "opencode/gpt-5.6-sol",
    "haiku-4.5": "opencode/claude-haiku-4-5",
    "sonnet-5": "opencode/claude-sonnet-5",
    "opus-5": "opencode/claude-opus-5",
    "opus-4.8-high": "opencode/claude-opus-4-8",
    "fable-5-high": "opencode/claude-fable-5",
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
  opencode: {
    name: "opencode",
    binaries: ["opencode"],
    binEnv: "RELAY_OPENCODE_BIN",
    // Verified 2026-07-25 against opencode 1.18.5:
    // `opencode run --model opencode/big-pickle …` answered on stdout, exit 0.
    // Permission posture stays with the user's own opencode config — relay
    // never passes `--auto` or any other permission/sandbox flag.
    buildArgs: (prompt, model) => [
      "run",
      "--model",
      opencodeModelId(model),
      prompt,
    ],
    verified: true,
    loginHint: "opencode providers login",
  },
  kimi: {
    name: "kimi",
    binaries: ["kimi"],
    binEnv: "RELAY_KIMI_BIN",
    buildArgs: (prompt, model) => ["-p", prompt, "--model", model],
    verified: false,
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
