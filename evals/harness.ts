// Eval harness: drives `relay mcp serve` over stdio exactly the way host
// agents (Cursor / Claude Code / Codex) do — same protocol, same tool calls —
// so scenario results predict host behavior without hand-testing in an IDE.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const ROOT = resolve(import.meta.dir, "..");

export type ToolResult = {
  ok: boolean;
  text: string;
  json?: Record<string, unknown>;
};

export class RelayMcp {
  private client: Client;
  private transport: StdioClientTransport;

  private constructor(client: Client, transport: StdioClientTransport) {
    this.client = client;
    this.transport = transport;
  }

  /** Spawn a fresh `relay mcp serve` (from source) with isolated XDG dirs. */
  static async spawn(opts: {
    cwd?: string;
    env?: Record<string, string>;
    dataDir?: string;
  } = {}): Promise<RelayMcp> {
    const dataDir = opts.dataDir ?? mkdtempSync(join(tmpdir(), "relay-eval-data-"));
    const configDir = mkdtempSync(join(tmpdir(), "relay-eval-config-"));
    const transport = new StdioClientTransport({
      command: "bun",
      args: ["run", join(ROOT, "src/cli.ts"), "mcp", "serve"],
      cwd: opts.cwd ?? ROOT,
      env: {
        ...(process.env as Record<string, string>),
        XDG_DATA_HOME: dataDir,
        XDG_CONFIG_HOME: configDir,
        ...opts.env,
      },
      stderr: "ignore",
    });
    const client = new Client({ name: "relay-evals", version: "1.0.0" });
    await client.connect(transport);
    return new RelayMcp(client, transport);
  }

  /** Call a tool; tool-level failures come back as { ok: false } either via
   * protocol error (SDK throws) or isError result — normalize both. */
  async call(
    name: string,
    args: Record<string, unknown>,
    timeoutMs = 300_000,
  ): Promise<ToolResult> {
    try {
      const r = (await this.client.callTool({ name, arguments: args }, undefined, {
        timeout: timeoutMs,
        resetTimeoutOnProgress: true,
      })) as { content?: { type: string; text?: string }[]; isError?: boolean };
      const text = (r.content ?? [])
        .map((c) => (c.type === "text" ? (c.text ?? "") : ""))
        .join("\n");
      let json: Record<string, unknown> | undefined;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // not all tools return JSON
      }
      return { ok: !r.isError, text, json };
    } catch (e) {
      return { ok: false, text: (e as Error).message };
    }
  }

  async close(): Promise<void> {
    await this.client.close().catch(() => {});
    await this.transport.close().catch(() => {});
  }
}

/** Fresh scratch git repo with a known typo fixture. */
export function makeRepo(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `relay-eval-${name}-`));
  const g = (args: string[]) => execFileSync("git", ["-C", dir, ...args]);
  g(["init", "-q"]);
  g(["config", "user.email", "evals@relay.local"]);
  g(["config", "user.name", "Relay Evals"]);
  writeFileSync(join(dir, "hello.txt"), "hello teh world\n");
  writeFileSync(
    join(dir, "README.md"),
    "# eval fixture\n\nA tiny repo used by relay's eval suite.\n",
  );
  g(["add", "-A"]);
  g(["commit", "-qm", "init"]);
  return dir;
}

export function git(dir: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** Non-repo scratch dir (for the cwd guard scenario). */
export function makeBareDir(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `relay-eval-${name}-`));
  mkdirSync(dir, { recursive: true });
  return dir;
}

export type ScenarioResult = {
  name: string;
  layer: "mcp" | "host";
  status: "pass" | "fail" | "blocked";
  ms: number;
  detail: string;
};

/** Environment problems (expired CLI auth, missing tools) aren't product
 * failures — report them as blocked so the suite stays honest about what it
 * could and couldn't prove. */
export class Blocked extends Error {}

export async function runScenario(
  name: string,
  layer: "mcp" | "host",
  fn: () => Promise<string>,
): Promise<ScenarioResult> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { name, layer, status: "pass", ms: Date.now() - t0, detail };
  } catch (e) {
    return {
      name,
      layer,
      status: e instanceof Blocked ? "blocked" : "fail",
      ms: Date.now() - t0,
      detail: (e as Error).message.slice(0, 400),
    };
  }
}

export function expect(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}
