// relay memory: "start new threads freely — relay remembers."
//
// Recall is a layered digest of what already exists on this machine:
//   1. git        — branch, dirty files, recent commits (works with zero relay use)
//   2. relay runs — delegated work from runs.jsonl, matched by repo cwd
//   3. notes      — durable one-liners deposited via relay_remember / `relay remember`
//   4. sessions   — recent host-agent conversations (best-effort, see transcripts.ts)
//
// Everything is local files; nothing leaves the machine. The digest is
// deterministic (no LLM pass) so recall is instant and testable.

import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { relayDataDir } from "./paths.ts";
import { readRuns, type RunRecord } from "./runlog.ts";
import { listChangedFiles, runGit } from "./git.ts";
import { recentSessions } from "./transcripts.ts";

export type MemoryNote = {
  ts: string;
  note: string;
  kind: string; // decision | todo | context | watchout | note
  source: string; // mcp | cli
};

const NOTE_KINDS = new Set(["decision", "todo", "context", "watchout", "note"]);

/** Notes are keyed by repo identity (git root when available), so the same
 * memory surfaces no matter which subdirectory a session starts in. */
export async function memoryRepoKey(cwd: string): Promise<string> {
  const root = (await runGit(cwd, ["rev-parse", "--show-toplevel"])) || cwd;
  try {
    return realpathSync(root);
  } catch {
    return root;
  }
}

export function memoryPath(repoKey: string): string {
  const hash = createHash("sha256").update(repoKey).digest("hex").slice(0, 16);
  return join(relayDataDir(), "memory", `${hash}.jsonl`);
}

export async function rememberNote(
  cwd: string,
  note: string,
  opts: { kind?: string; source?: string } = {},
): Promise<MemoryNote> {
  const text = note.trim();
  if (!text) throw new Error("note is empty — pass a one-line durable note");
  if (text.length > 2_000) {
    throw new Error(
      "note too long (>2000 chars) — memory stores conclusions, not transcripts; distill it to the durable one-liner(s)",
    );
  }
  const kind = opts.kind && NOTE_KINDS.has(opts.kind) ? opts.kind : "note";
  const record: MemoryNote = {
    ts: new Date().toISOString(),
    note: text,
    kind,
    source: opts.source ?? "cli",
  };
  const path = memoryPath(await memoryRepoKey(cwd));
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(record) + "\n", "utf8");
  return record;
}

export async function readNotes(cwd: string): Promise<MemoryNote[]> {
  const path = memoryPath(await memoryRepoKey(cwd));
  if (!existsSync(path)) return [];
  const notes: MemoryNote[] = [];
  for (const line of readFileSync(path, "utf8").split("\n").filter(Boolean)) {
    try {
      notes.push(JSON.parse(line) as MemoryNote);
    } catch {
      // skip corrupt lines — memory must never fail recall
    }
  }
  return notes;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function oneLine(s: string, max = 110): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

/** Runs whose recorded cwd is inside this repo (macOS /var vs /private/var safe). */
function runMatchesRepo(r: RunRecord, repoKey: string): boolean {
  if (!r.cwd) return false;
  let c = r.cwd;
  try {
    c = realpathSync(c);
  } catch {
    // recorded dir may be gone (worktrees, temp) — compare as recorded
  }
  return c === repoKey || c.startsWith(repoKey + "/");
}

export type RecallOptions = {
  /** Skip host transcript scanning (used by tests for determinism). */
  sessions?: boolean;
};

/**
 * The catch-up digest for a new session: everything that matters about this
 * repo, newest first, capped so it never bloats the very context it protects.
 */
export async function recallDigest(cwd: string, opts: RecallOptions = {}): Promise<string> {
  const repoKey = await memoryRepoKey(cwd);
  const lines: string[] = [];

  // --- 1. git: ground truth, present even for someone who never ran relay --
  const branch = await runGit(repoKey, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const dirty = await listChangedFiles(repoKey);
  lines.push(`# relay recall — ${repoKey}`);
  if (branch) {
    const dirtyNote =
      dirty.length === 0
        ? "clean tree"
        : `${dirty.length} uncommitted change(s): ${dirty.slice(0, 6).join(", ")}${
            dirty.length > 6 ? ", …" : ""
          }`;
    lines.push(`on branch ${branch} · ${dirtyNote}`);
  } else {
    lines.push("(not a git repository — git layer unavailable)");
  }

  const log = await runGit(repoKey, [
    "log",
    "-8",
    "--pretty=format:%h · %cr · %s",
  ]);
  if (log) {
    lines.push("", "## recent commits");
    for (const l of log.split("\n")) lines.push(`- ${oneLine(l)}`);
  }

  const relayBranches = (await runGit(repoKey, ["branch", "--list", "relay/*"]))
    .split("\n")
    .map((b) => b.replace(/^[* ]+/, "").trim())
    .filter(Boolean);
  if (relayBranches.length) {
    lines.push("", "## unreconciled relay branches (work parked, not merged)");
    for (const b of relayBranches) lines.push(`- ${b}`);
  }

  // --- 2. relay runs: what was delegated and how it went ------------------
  const runs = readRuns(500).filter((r) => runMatchesRepo(r, repoKey));
  if (runs.length) {
    lines.push("", "## recent relay work");
    for (const r of runs.slice(-8).reverse()) {
      const status = r.status === "ok" ? "ok" : r.status.toUpperCase();
      const files = r.files_changed?.length ? ` · ${r.files_changed.length} file(s)` : "";
      const task = r.task ? ` · "${oneLine(r.task, 70)}"` : "";
      lines.push(`- ${status} · ${r.lane}/${r.model}${task}${files} (${timeAgo(r.ts)})`);
    }
    const failed = runs.filter((r) => r.status === "failed").slice(-3);
    if (failed.length) {
      lines.push(
        `- open threads: ${failed.length} failed run(s) above may need a retry or human look`,
      );
    }
  }

  // --- 3. notes: what sessions chose to keep ------------------------------
  const notes = await readNotes(cwd);
  if (notes.length) {
    lines.push("", "## notes (deposited by past sessions)");
    const recent = notes.slice(-10);
    for (const n of recent.reverse()) {
      lines.push(`- [${n.kind}] ${oneLine(n.note, 160)} (${timeAgo(n.ts)})`);
    }
    if (notes.length > 10) lines.push(`- (+${notes.length - 10} older notes)`);
  }

  // --- 4. host sessions: what the human asked other agents (best-effort) --
  if (opts.sessions !== false) {
    for (const s of recentSessions(repoKey)) {
      lines.push("", `## recent ${s.host} session (${timeAgo(s.ts)})`);
      for (const m of s.messages) lines.push(`- "${oneLine(m, 140)}"`);
    }
  }

  if (lines.length <= 2) {
    lines.push("", "nothing recorded yet — memory grows as you work (and as you relay).");
  }
  lines.push(
    "",
    "(all layers are local files: git + relay's run log + deposited notes + host session files)",
  );
  const out = lines.join("\n");
  // hard cap: recall exists to SAVE context
  return out.length > 6_000 ? out.slice(0, 6_000) + "\n…(truncated)" : out;
}
