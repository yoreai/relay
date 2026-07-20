import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { discoverClaudeBinary } from "./backends/claude.ts";
import { discoverCursorBinary } from "./backends/cursor.ts";
import { which } from "./which.ts";

const RELAY_SERVER = { command: "relay", args: ["mcp", "serve"] };

/** Merge relay into an mcpServers-style JSON config. Pure for testability. */
export function mergeMcpJson(text: string): { out: string; changed: boolean } {
  const cfg = (text.trim() ? JSON.parse(text) : {}) as {
    mcpServers?: Record<string, unknown>;
  };
  cfg.mcpServers ??= {};
  const current = cfg.mcpServers.relay;
  if (current && JSON.stringify(current) === JSON.stringify(RELAY_SERVER)) {
    return { out: text, changed: false };
  }
  cfg.mcpServers.relay = RELAY_SERVER;
  return { out: JSON.stringify(cfg, null, 2) + "\n", changed: true };
}

function registerInJsonConfig(path: string, createIfMissing: boolean): string {
  const exists = existsSync(path);
  if (!exists && !createIfMissing) {
    return `· skipped ${path} (file not found — configure manually)`;
  }
  const text = exists ? readFileSync(path, "utf8") : "";
  let merged;
  try {
    merged = mergeMcpJson(text);
  } catch {
    return `✗ could not parse ${path} — add relay manually (see README)`;
  }
  if (!merged.changed) return `· already registered in ${path}`;
  if (exists) copyFileSync(path, path + ".relay-bak");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, merged.out, "utf8");
  return `✓ registered relay in ${path}${exists ? ` (backup: ${path}.relay-bak)` : ""}`;
}

export function runSetup(): string {
  const lines: string[] = ["relay setup — registering the MCP server", ""];

  if (!which("relay")) {
    lines.push(
      "! `relay` is not on PATH — agents launched outside this shell may not find it.",
      "  brew install yoreai/tap/relay  (or add the binary's directory to PATH)",
      "",
    );
  }

  // Cursor: global MCP config
  if (discoverCursorBinary() || existsSync(join(homedir(), ".cursor"))) {
    lines.push(
      `cursor: ${registerInJsonConfig(join(homedir(), ".cursor", "mcp.json"), true)}`,
    );
  } else {
    lines.push("cursor: not detected — skipped");
  }

  // Claude Code: merge only if its config already exists (it owns the file)
  if (discoverClaudeBinary()) {
    const claudeCfg = join(homedir(), ".claude.json");
    if (existsSync(claudeCfg)) {
      lines.push(`claude: ${registerInJsonConfig(claudeCfg, false)}`);
    } else {
      lines.push(
        "claude: detected — register with:  claude mcp add relay -- relay mcp serve",
      );
    }
  } else {
    lines.push("claude: not detected — skipped");
  }

  // Codex: print the snippet; its TOML is too easy to corrupt to edit blindly
  if (existsSync(join(homedir(), ".codex"))) {
    lines.push(
      "codex: add to ~/.codex/config.toml:",
      "         [mcp_servers.relay]",
      '         command = "relay"',
      '         args = ["mcp", "serve"]',
    );
  }

  lines.push("");
  lines.push("done. verify with `relay doctor`; agents get relay_run / relay_status / relay_savings.");
  return lines.join("\n");
}
