// Host session transcripts — the "what did the agent do without relay" layer.
//
// All three hosts already persist conversations as local JSONL; relay reads
// the residue instead of hooking the hosts. Formats are undocumented and
// change with host updates, so every adapter is best-effort: any parse
// failure degrades to "no sessions", never to a recall error. We extract the
// USER's messages only — what the human asked is the highest-signal,
// lowest-risk catch-up material (assistant output is huge and re-derivable).
//
// Observed formats (2026-07, verified against live files):
//   cursor: ~/.cursor/projects/<slug>/agent-transcripts/<id>/<id>.jsonl
//           {"role":"user","message":{"content":[{"type":"text","text":"…"}]}}
//           user text wraps the real ask in <user_query>…</user_query>
//   claude: ~/.claude/projects/<munged-cwd>/<session>.jsonl
//           {"type":"user","message":{"role":"user","content":"…"| [{type,text}]}}
//   codex:  ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
//           line 1 session_meta carries payload.cwd; user turns are
//           {"type":"event_msg","payload":{"type":"user_message","message":"…"}}

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type SessionExcerpt = {
  host: "cursor" | "claude" | "codex";
  ts: string; // session file mtime, ISO
  messages: string[]; // recent user asks, oldest → newest
};

const MAX_SESSIONS_PER_HOST = 2;
const MAX_MESSAGES_PER_SESSION = 4;
const MAX_AGE_DAYS = 7;
const MAX_FILE_BYTES = 30 * 1024 * 1024;

type Options = { home?: string; now?: number };

export function recentSessions(repoCwd: string, opts: Options = {}): SessionExcerpt[] {
  const home = opts.home ?? homedir();
  const now = opts.now ?? Date.now();
  const out: SessionExcerpt[] = [];
  for (const adapter of [cursorSessions, claudeSessions, codexSessions]) {
    try {
      out.push(...adapter(repoCwd, home, now));
    } catch {
      // a host changed its format or the dir is unreadable — skip that layer
    }
  }
  return out.sort((a, b) => a.ts.localeCompare(b.ts));
}

function fresh(path: string, now: number): { ok: boolean; mtime: Date } {
  const st = statSync(path);
  return {
    ok: now - st.mtimeMs < MAX_AGE_DAYS * 86_400_000 && st.size <= MAX_FILE_BYTES,
    mtime: st.mtime,
  };
}

function lastUserMessages(texts: string[]): string[] {
  const cleaned = texts
    .map(cleanUserText)
    .filter((t) => t.length > 0);
  return cleaned.slice(-MAX_MESSAGES_PER_SESSION);
}

/** Strip host-injected wrappers/metadata down to what the human typed. */
export function cleanUserText(raw: string): string {
  const trimmedRaw = raw.trim();
  // relay's own machinery echoed back as "user" turns: worker prompts in
  // codex sessions, auth-probe one-liners from relay doctor
  if (
    trimmedRaw.startsWith("[relay worker]") ||
    /^(say only|reply with exactly): ok$/.test(trimmedRaw)
  ) {
    return "";
  }
  // tool results / command output masquerading as user turns
  if (/^(Caveat:|<local-command|\[Request interrupted)/.test(trimmedRaw)) return "";
  let t = raw;
  const q = /<user_query>([\s\S]*?)<\/user_query>/.exec(t);
  if (q) t = q[1]!;
  // metadata-only blocks (timestamps, attached files, system reminders,
  // task notifications — tag names may contain dashes/underscores). Nested
  // tags need repeated passes; strip any orphan tags left behind.
  for (let prev = ""; prev !== t; ) {
    prev = t;
    t = t.replace(/<[a-z][a-z_-]*>[\s\S]*?<\/[a-z][a-z_-]*>/g, " ");
  }
  t = t.replace(/<\/?[a-z][a-z_-]*>/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

// --- cursor ---------------------------------------------------------------

function cursorSlug(repoCwd: string): string {
  return repoCwd.replace(/\//g, "-").replace(/^-/, "");
}

function cursorSessions(repoCwd: string, home: string, now: number): SessionExcerpt[] {
  const dir = join(home, ".cursor", "projects", cursorSlug(repoCwd), "agent-transcripts");
  if (!existsSync(dir)) return [];
  const files: { path: string; mtime: Date }[] = [];
  for (const id of readdirSync(dir)) {
    const f = join(dir, id, `${id}.jsonl`);
    if (!existsSync(f)) continue;
    const { ok, mtime } = fresh(f, now);
    if (ok) files.push({ path: f, mtime });
  }
  files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return files.slice(0, MAX_SESSIONS_PER_HOST).map(({ path, mtime }) => {
    const texts: string[] = [];
    for (const line of readFileSync(path, "utf8").split("\n").filter(Boolean)) {
      try {
        const j = JSON.parse(line) as {
          role?: string;
          message?: { content?: { type?: string; text?: string }[] };
        };
        if (j.role !== "user") continue;
        for (const c of j.message?.content ?? []) {
          if (c.type === "text" && c.text) texts.push(c.text);
        }
      } catch {
        // skip corrupt lines
      }
    }
    return { host: "cursor" as const, ts: mtime.toISOString(), messages: lastUserMessages(texts) };
  }).filter((s) => s.messages.length > 0);
}

// --- claude ---------------------------------------------------------------

function claudeMunged(repoCwd: string): string {
  return repoCwd.replace(/[/.]/g, "-");
}

function claudeSessions(repoCwd: string, home: string, now: number): SessionExcerpt[] {
  const dir = join(home, ".claude", "projects", claudeMunged(repoCwd));
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => join(dir, f))
    .map((path) => ({ path, ...fresh(path, now) }))
    .filter((f) => f.ok)
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return files.slice(0, MAX_SESSIONS_PER_HOST).map(({ path, mtime }) => {
    const texts: string[] = [];
    for (const line of readFileSync(path, "utf8").split("\n").filter(Boolean)) {
      try {
        const j = JSON.parse(line) as {
          type?: string;
          message?: { content?: string | { type?: string; text?: string }[] };
        };
        if (j.type !== "user") continue;
        const content = j.message?.content;
        if (typeof content === "string") texts.push(content);
        else {
          for (const c of content ?? []) {
            if (c.type === "text" && c.text) texts.push(c.text);
          }
        }
      } catch {
        // skip corrupt lines
      }
    }
    return { host: "claude" as const, ts: mtime.toISOString(), messages: lastUserMessages(texts) };
  }).filter((s) => s.messages.length > 0);
}

// --- codex ----------------------------------------------------------------

function codexSessions(repoCwd: string, home: string, now: number): SessionExcerpt[] {
  const root = join(home, ".codex", "sessions");
  if (!existsSync(root)) return [];
  // sessions/YYYY/MM/DD/rollout-*.jsonl — walk newest days first, cap the scan
  const candidates: { path: string; mtime: Date }[] = [];
  for (const year of readdirSync(root).sort().reverse().slice(0, 2)) {
    for (const month of readdirSync(join(root, year)).sort().reverse().slice(0, 3)) {
      for (const day of readdirSync(join(root, year, month)).sort().reverse().slice(0, 10)) {
        for (const f of readdirSync(join(root, year, month, day))) {
          if (!f.endsWith(".jsonl")) continue;
          const path = join(root, year, month, day, f);
          const { ok, mtime } = fresh(path, now);
          if (ok) candidates.push({ path, mtime });
        }
      }
    }
  }
  candidates.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  const out: SessionExcerpt[] = [];
  for (const { path, mtime } of candidates.slice(0, 40)) {
    if (out.length >= MAX_SESSIONS_PER_HOST) break;
    const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
    if (!lines.length) continue;
    let meta: { payload?: { cwd?: string } };
    try {
      meta = JSON.parse(lines[0]!) as typeof meta;
    } catch {
      continue;
    }
    const sessionCwd = meta.payload?.cwd ?? "";
    // /var vs /private/var: compare suffix-tolerantly
    if (sessionCwd !== repoCwd && !sessionCwd.endsWith(repoCwd) && !repoCwd.endsWith(sessionCwd)) {
      continue;
    }
    const texts: string[] = [];
    for (const line of lines.slice(1)) {
      try {
        const j = JSON.parse(line) as {
          type?: string;
          payload?: { type?: string; message?: string };
        };
        if (j.type === "event_msg" && j.payload?.type === "user_message" && j.payload.message) {
          texts.push(j.payload.message);
        }
      } catch {
        // skip corrupt lines
      }
    }
    const messages = lastUserMessages(texts);
    if (messages.length) out.push({ host: "codex", ts: mtime.toISOString(), messages });
  }
  return out;
}
