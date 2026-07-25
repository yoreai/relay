import {
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { removeActivationHints } from "./activation.ts";
import { claudeDesktopConfigPath } from "./setup.ts";
import { relayConfigDir, relayDataDir, userHome } from "./paths.ts";
import { which } from "./which.ts";

/** Remove relay from an mcpServers-style JSON config. Pure for testability. */
export function removeMcpJson(text: string): { out: string; changed: boolean } {
  const cfg = (text.trim() ? JSON.parse(text) : {}) as {
    mcpServers?: Record<string, unknown>;
    projects?: Record<string, { mcpServers?: Record<string, unknown> } | unknown>;
  };
  let changed = false;
  if (cfg.mcpServers && "relay" in cfg.mcpServers) {
    delete cfg.mcpServers.relay;
    changed = true;
  }
  // Claude Code also keeps per-project servers under projects[path].mcpServers,
  // and `claude mcp remove -s user` never touches those. Leaving one behind is
  // worse than leaving nothing: the entry outlives the binary, so that project
  // opens with a relay server it can no longer spawn.
  for (const project of Object.values(cfg.projects ?? {})) {
    const servers = (project as { mcpServers?: Record<string, unknown> })?.mcpServers;
    if (servers && "relay" in servers) {
      delete servers.relay;
      changed = true;
    }
  }
  if (!changed) return { out: text, changed: false };
  return { out: JSON.stringify(cfg, null, 2) + "\n", changed: true };
}

/** Strip the [mcp_servers.relay] block from Codex config.toml. Pure for testability. */
export function removeCodexToml(text: string): { out: string; changed: boolean } {
  if (!/^\[mcp_servers\.relay\]/m.test(text)) return { out: text, changed: false };
  // the block runs until the next table header or EOF
  const out = text.replace(
    /(?:^|\n)\[mcp_servers\.relay\][\s\S]*?(?=\n\[|$)/,
    "",
  );
  return { out: out.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, ""), changed: true };
}

function deregisterJson(path: string): string {
  if (!existsSync(path)) return `· ${path} not found (nothing to remove)`;
  try {
    const removed = removeMcpJson(readFileSync(path, "utf8"));
    if (!removed.changed) return `· relay not registered in ${path}`;
    copyFileSync(path, path + ".relay-bak");
    writeFileSync(path, removed.out, "utf8");
    return `✓ removed relay from ${path} (backup: ${path}.relay-bak)`;
  } catch {
    return `✗ could not parse ${path} — remove the "relay" entry manually`;
  }
}

async function runToolMcpRemove(cmd: string[]): Promise<boolean> {
  if (!which(cmd[0]!)) return false;
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

/**
 * Reverse of `relay setup`: deregister the MCP server everywhere so agents
 * don't keep a dead "relay" entry after the binary is gone. With --purge,
 * also delete relay's config and data dirs. The binary itself is the package
 * manager's job (`brew uninstall relay`) — we only clean what setup created.
 */
export async function runUninstall(opts: { purge?: boolean } = {}): Promise<string> {
  const out: string[] = [];
  const say = (s: string) => {
    out.push(s);
    console.log(s);
  };

  say("relay uninstall — deregistering MCP…");
  say(`  cursor: ${deregisterJson(join(userHome(), ".cursor", "mcp.json"))}`);
  say(`  claude app: ${deregisterJson(claudeDesktopConfigPath())}`);

  const claudeJson = join(userHome(), ".claude.json");
  if (await runToolMcpRemove(["claude", "mcp", "remove", "-s", "user", "relay"])) {
    say("  claude: ✓ removed via `claude mcp remove`");
    // The CLI removed user scope; project-scoped entries in the same file are
    // invisible to it, so sweep them too rather than reporting a clean uninstall
    // over a registration that survived.
    const swept = deregisterJson(claudeJson);
    if (swept.startsWith("✓")) say(`  claude: ${swept} (project-scoped)`);
  } else {
    say(`  claude: ${deregisterJson(claudeJson)}`);
  }

  const codexToml = join(userHome(), ".codex", "config.toml");
  if (await runToolMcpRemove(["codex", "mcp", "remove", "relay"])) {
    say("  codex:  ✓ removed via `codex mcp remove`");
  } else if (existsSync(codexToml)) {
    try {
      const removed = removeCodexToml(readFileSync(codexToml, "utf8"));
      if (removed.changed) {
        copyFileSync(codexToml, codexToml + ".relay-bak");
        writeFileSync(codexToml, removed.out, "utf8");
        say(`  codex:  ✓ removed relay from ${codexToml} (backup: ${codexToml}.relay-bak)`);
      } else {
        say("  codex:  · relay not registered");
      }
    } catch {
      say(`  codex:  ✗ could not update ${codexToml} — remove [mcp_servers.relay] manually`);
    }
  } else {
    say("  codex:  · not installed (nothing to remove)");
  }

  say("");
  say("removing activation hints…");
  for (const line of removeActivationHints()) say(line);

  say("");
  if (opts.purge) {
    for (const dir of [relayConfigDir(), relayDataDir()]) {
      try {
        rmSync(dir, { recursive: true, force: true });
        say(`✓ deleted ${dir}`);
      } catch {
        say(`✗ could not delete ${dir}`);
      }
    }
  } else {
    say("kept (delete with `relay uninstall --purge`, or by hand):");
    say(`  ${relayConfigDir()}   — your directive + settings`);
    say(`  ${relayDataDir()}   — run history + savings receipts`);
  }

  say("");
  say("last step — remove the binary itself:");
  say("  brew uninstall relay        (or delete the binary from PATH)");
  say("note: repos where walkaway ran may still have a .relay/ scratch dir — safe to delete.");
  return out.join("\n");
}
