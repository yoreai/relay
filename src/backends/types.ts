import type { Brief } from "../brief.ts";

export type Usage = {
  tokensIn?: number;
  tokensOut?: number;
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
