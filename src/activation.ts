import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
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

When the user hands over SEVERAL independent tasks, don't queue them: call
\`relay_run\` once per task with \`wait: false\` and a worktree lane (the user's
walkaway lane, usually \`build\`). Each run gets its own isolated worktree and
\`relay/*\` branch, so they can't collide, and the user reviews one diff per
task. Relay refuses runs past the repo's \`max_parallel\` and names the ids to
poll — queue those rather than retrying.

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
    const re = new RegExp(`${escapeRe(BEGIN)}[\\s\\S]*?${escapeRe(END)}\\n?`);
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
  const re = new RegExp(`\\n*${escapeRe(BEGIN)}[\\s\\S]*?${escapeRe(END)}[ \\t]*\\n?`);
  const match = re.exec(text);
  if (!match) return { out: text, changed: false };
  return {
    out: joinSeam(text.slice(0, match.index), text.slice(match.index + match[0].length)),
    changed: true,
  };
}

/**
 * Rejoin the two sides of a removed block, normalizing whitespace ONLY at the
 * seam. This used to collapse every blank-line run in the whole file, which
 * silently reflowed content relay doesn't own — `~/.claude/CLAUDE.md` is shared
 * ground, and other context tools maintain their own fenced blocks in it.
 * Removing relay must be invisible to them.
 */
function joinSeam(before: string, after: string): string {
  const head = before.replace(/\s+$/, "");
  const tail = after.replace(/^\n+/, "");
  if (!head) return tail;
  if (!tail) return `${head}\n`;
  return `${head}\n\n${tail}`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrite a user-owned instruction file without risking it.
 *
 * `~/.claude/CLAUDE.md` can be years of accumulated instructions, and relay
 * owns only a fenced block inside it. A read-splice-write that dies between
 * truncate and write leaves the user with nothing, and two concurrent `relay
 * setup` runs can interleave — so keep one backup and land the new content by
 * rename, which is atomic within a filesystem. Other tools may manage these
 * files too; the backup is what makes that recoverable rather than final.
 */
function rewriteInPlace(path: string, next: string): void {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) copyFileSync(path, `${path}.relay-bak`);
  const tmp = `${path}.relay-tmp-${process.pid}`;
  writeFileSync(tmp, next, "utf8");
  renameSync(tmp, path);
}

function upsertMemoryFile(path: string): string {
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const merged = mergeActivationBlock(text);
  if (!merged.changed) return `· activation hint already in ${path}`;
  const had = existsSync(path);
  rewriteInPlace(path, merged.out);
  return `✓ activation hint → ${path}${had ? ` (backup: ${path}.relay-bak)` : ""}`;
}

function stripMemoryFile(path: string): string {
  if (!existsSync(path)) return `· ${path} not found (nothing to remove)`;
  const removed = removeActivationBlock(readFileSync(path, "utf8"));
  if (!removed.changed) return `· no activation hint in ${path}`;
  rewriteInPlace(path, removed.out);
  return `✓ removed activation hint from ${path} (backup: ${path}.relay-bak)`;
}

export function cursorRulePath(home: string = homedir()): string {
  return join(home, ".cursor", "rules", "relay.mdc");
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

/**
 * Bring already-installed hint blocks up to this binary's wording.
 *
 * These files are the only channel relay controls that every host re-reads
 * fresh each session — MCP tool descriptions get cached by the client, so
 * guidance that ships only there can sit stale in a long session. But nothing
 * refreshed them either: `installActivationHints` runs at `relay setup` and
 * never again, so an upgraded relay kept whatever wording was current the last
 * time the user ran setup.
 *
 * Only touches files that already carry relay's block (and a cursor rule that
 * already exists): an upgrade must never install relay into a host the user
 * didn't set up, or reinstate hints they deliberately removed. Content-based
 * rather than version-stamped, so it self-heals and is a no-op when current.
 *
 * `home` is injectable because Bun's `os.homedir()` ignores $HOME, which would
 * otherwise make this untestable without writing to the developer's own files.
 */
export function refreshActivationHints(home: string = homedir()): string[] {
  const refreshed: string[] = [];
  try {
    const rule = cursorRulePath(home);
    if (existsSync(rule) && readFileSync(rule, "utf8") !== CURSOR_RULE) {
      writeFileSync(rule, CURSOR_RULE, "utf8");
      refreshed.push(rule);
    }
  } catch {
    // a hint file we can't write is not worth failing anything over
  }
  for (const path of [
    join(home, ".claude", "CLAUDE.md"),
    join(home, ".codex", "AGENTS.md"),
  ]) {
    try {
      if (!existsSync(path)) continue;
      const text = readFileSync(path, "utf8");
      if (!text.includes(BEGIN)) continue;
      const merged = mergeActivationBlock(text);
      if (!merged.changed) continue;
      rewriteInPlace(path, merged.out);
      refreshed.push(path);
    } catch {
      // same — never let instruction bookkeeping break a server start
    }
  }
  return refreshed;
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
