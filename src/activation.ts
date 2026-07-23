import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Activation hints: a tiny per-host instruction so agents reliably CALL the
 * relay MCP tool when the user explicitly says so ("relay this: …"). Without
 * it, hosts often prefer their built-in tools and silently do the work
 * themselves. Marker-fenced so `relay uninstall` removes exactly what setup
 * added. Safe against recursion: the text carries the RELAY_WORKER guard and
 * relay_run hard-refuses worker calls regardless.
 */

const BEGIN = "<!-- BEGIN RELAY ACTIVATION (managed by `relay setup`) -->";
const END = "<!-- END RELAY ACTIVATION -->";

const HINT_BODY = `When the user explicitly hands a task to relay — "relay this: …",
"hey relay …", "use relay to …", "ask relay …" — call the \`relay_run\` MCP
tool with the task (and the workspace root as \`cwd\` if the tool accepts it)
instead of doing the work yourself — even when the task looks trivial enough
to just do. The user chose relay deliberately; doing it yourself silently
defeats their cost tracking. relay routes it to the cheapest capable
model, verifies with the repo's own lint/tests, and returns a receipt.
For any task likely to take more than about 30 seconds, call \`relay_run\` with
\`wait: false\` so it returns a run id immediately. Tell the user the run
started, then poll \`relay_status\` with that id about every 30 seconds and
briefly report new phases or blockers until it finishes; do not leave the user
staring at one opaque, blocking tool call. Report the final outcome as the
result. If the request is ambiguous or relay fails, do the task normally.

relay also remembers. When the user asks "where were we", "catch me up",
"what's the status here" — or at the start of a session where prior context
would clearly help — call the \`relay_recall\` MCP tool with the workspace
root as \`cwd\`: it returns a compact local digest (recent git activity,
relay runs, notes from past sessions, recent agent asks) so the user never
re-explains. When the user says "remember this" or a session ends with a
decision, next step, or watch-out worth keeping, deposit ONE line via
\`relay_remember\`. Chat context dies with the chat; relay's memory survives
it — users can start fresh sessions freely.

Never call relay tools when the RELAY_WORKER environment variable is set —
relay workers must not re-delegate to relay.`;

export const ACTIVATION_BLOCK = `${BEGIN}\n${HINT_BODY}\n${END}\n`;

/** Cursor rule file (own file — trivially removable). */
const CURSOR_RULE = `---
description: Delegate to relay when the user explicitly asks ("relay this…")
alwaysApply: true
---

${ACTIVATION_BLOCK}`;

/** Append the fenced block to a memory file. Pure for testability. */
export function mergeActivationBlock(text: string): { out: string; changed: boolean } {
  if (text.includes(BEGIN)) {
    // refresh in place so wording updates ship with new versions
    const re = new RegExp(
      `${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`,
    );
    const out = text.replace(re, ACTIVATION_BLOCK);
    return { out, changed: out !== text };
  }
  const trimmed = text.trimEnd();
  const prefix = trimmed ? `${trimmed}\n\n` : "";
  return { out: prefix + ACTIVATION_BLOCK, changed: true };
}

/** Strip the fenced block. Pure for testability. */
export function removeActivationBlock(text: string): { out: string; changed: boolean } {
  if (!text.includes(BEGIN)) return { out: text, changed: false };
  const re = new RegExp(
    `\\n?${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`,
  );
  return {
    out: text.replace(re, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, ""),
    changed: true,
  };
}

function upsertMemoryFile(path: string): string {
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const merged = mergeActivationBlock(text);
  if (!merged.changed) return `· activation hint already in ${path}`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, merged.out, "utf8");
  return `✓ activation hint → ${path}`;
}

function stripMemoryFile(path: string): string {
  if (!existsSync(path)) return `· ${path} not found (nothing to remove)`;
  const removed = removeActivationBlock(readFileSync(path, "utf8"));
  if (!removed.changed) return `· no activation hint in ${path}`;
  writeFileSync(path, removed.out, "utf8");
  return `✓ removed activation hint from ${path}`;
}

export function cursorRulePath(): string {
  return join(homedir(), ".cursor", "rules", "relay.mdc");
}

/** Install per-host hints; hosts arg mirrors what setup detected. */
export function installActivationHints(hosts: {
  cursor: boolean;
  claude: boolean;
  codex: boolean;
}): string[] {
  const lines: string[] = [];
  if (hosts.cursor) {
    const p = cursorRulePath();
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, CURSOR_RULE, "utf8");
    lines.push(`  cursor: ✓ activation rule → ${p}`);
  }
  if (hosts.claude) {
    lines.push(`  claude: ${upsertMemoryFile(join(homedir(), ".claude", "CLAUDE.md"))}`);
  }
  if (hosts.codex) {
    lines.push(`  codex:  ${upsertMemoryFile(join(homedir(), ".codex", "AGENTS.md"))}`);
  }
  return lines;
}

export function removeActivationHints(): string[] {
  const lines: string[] = [];
  const rule = cursorRulePath();
  if (existsSync(rule)) {
    rmSync(rule, { force: true });
    lines.push(`  cursor: ✓ removed ${rule}`);
  } else {
    lines.push("  cursor: · no activation rule (nothing to remove)");
  }
  lines.push(`  claude: ${stripMemoryFile(join(homedir(), ".claude", "CLAUDE.md"))}`);
  lines.push(`  codex:  ${stripMemoryFile(join(homedir(), ".codex", "AGENTS.md"))}`);
  return lines;
}
