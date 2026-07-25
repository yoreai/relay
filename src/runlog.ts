import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { runsLogPath, relayDataDir } from "./paths.ts";

/** One phase transition of a run — the feed agents poll to narrate progress. */
export type RunEvent = {
  ts: string;
  phase: string;
  detail?: string;
};

/**
 * ids are relay-generated (`run_<ts>_<rand>`) on the write path, but the read
 * path takes whatever the user typed after `relay status`, so `../../…` would
 * walk straight out of the events dir. Anything that isn't shaped like an id
 * can't name a file we'd have written.
 */
function eventsPath(id: string): string | null {
  if (!/^[A-Za-z0-9_.-]+$/.test(id) || id.includes("..")) return null;
  return join(relayDataDir(), "events", `${id}.jsonl`);
}

export function appendEvent(id: string, phase: string, detail?: string): void {
  try {
    const path = eventsPath(id);
    if (!path) return;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const event: RunEvent = {
      ts: new Date().toISOString(),
      phase,
      ...(detail ? { detail } : {}),
    };
    appendFileSync(path, JSON.stringify(event) + "\n", { encoding: "utf8", mode: 0o600 });
  } catch {
    // progress is best-effort — never fail a run over it
  }
}

export function readEvents(id: string): RunEvent[] {
  const path = eventsPath(id);
  if (!path || !existsSync(path)) return [];
  const events: RunEvent[] = [];
  for (const line of readFileSync(path, "utf8").split("\n").filter(Boolean)) {
    try {
      events.push(JSON.parse(line) as RunEvent);
    } catch {
      // skip corrupt
    }
  }
  return events;
}

export type RunRecord = {
  id: string;
  ts: string;
  status: "running" | "ok" | "failed" | "interrupted";
  lane: string;
  /** pid of the process driving the run, so readers can spot an abandoned one. */
  owner_pid?: number;
  backend: string;
  model: string;
  tier: string;
  tokens_in?: number;
  tokens_out?: number;
  usage_estimated?: boolean;
  verify_ok?: boolean;
  escalations: number;
  saved_usd?: number;
  task_hash: string;
  task?: string;
  files_changed?: string[];
  error?: string;
  cwd?: string;
};

export function newRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function hashTask(task: string): string {
  return createHash("sha256").update(task).digest("hex").slice(0, 16);
}

export function appendRun(record: RunRecord): void {
  const path = runsLogPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  appendFileSync(path, JSON.stringify(record) + "\n", { encoding: "utf8", mode: 0o600 });
}

/**
 * A run is driven in-process, so if that process dies the run can never finish
 * or append its terminal record — it just sits at "running" forever, and a
 * poller can't tell that from real progress. Reconciled on read rather than
 * rewritten: reads stay side-effect-free, so concurrent pollers can't race each
 * other appending, and a controller that's merely slow is never mislabeled.
 */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM means it exists but belongs to another user; only ESRCH means gone.
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Records from before owner pids carry no controller, so age is the only
 * signal left. Generous: no run survives the backend timeout by hours. */
const ORPHAN_AFTER_MS = 6 * 60 * 60 * 1000;

function reconcileAbandoned(r: RunRecord): RunRecord {
  if (r.status !== "running") return r;
  if (r.owner_pid != null) {
    if (processAlive(r.owner_pid)) return r;
    return {
      ...r,
      status: "interrupted",
      error: r.error ?? `controller process ${r.owner_pid} exited before the run finished`,
    };
  }
  if (Date.now() - Date.parse(r.ts) > ORPHAN_AFTER_MS) {
    return {
      ...r,
      status: "interrupted",
      error: r.error ?? "no controller recorded and the run is hours old",
    };
  }
  return r;
}

export function readRuns(limit = 50): RunRecord[] {
  const path = runsLogPath();
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  const records: RunRecord[] = [];
  for (const line of lines.slice(-limit * 3)) {
    try {
      records.push(JSON.parse(line) as RunRecord);
    } catch {
      // skip corrupt
    }
  }
  // collapse by id keeping last status
  const byId = new Map<string, RunRecord>();
  for (const r of records) byId.set(r.id, r);
  return [...byId.values()]
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .slice(-limit)
    .map(reconcileAbandoned);
}

export function getRun(id: string): RunRecord | null {
  return readRuns(500).find((r) => r.id === id) ?? null;
}

export function ensureDataDir(): void {
  mkdirSync(relayDataDir(), { recursive: true, mode: 0o700 });
}

export type SavingsSummary = {
  totalSavedUsd: number;
  byLane: Record<string, number>;
  byModel: Record<string, number>;
  runs: number;
  estimatedRuns: number;
  measuredRuns: number;
};

export type ModelStats = Record<string, { runs: number; ok: number }>;

/** Verify-success counts per model — local ground truth for `relay advise`. */
export function modelStats(): ModelStats {
  const stats: ModelStats = {};
  for (const r of readRuns(10_000)) {
    // An abandoned run says nothing about the model — the controller died, not
    // the backend — so it must not count against it in `relay advise`.
    if (r.status === "running" || r.status === "interrupted") continue;
    const s = (stats[r.model] ??= { runs: 0, ok: 0 });
    s.runs += 1;
    if (r.status === "ok") s.ok += 1;
  }
  return stats;
}

export function summarizeSavings(): SavingsSummary {
  const runs = readRuns(10_000).filter((r) => r.status === "ok");
  const byLane: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  let total = 0;
  let estimatedRuns = 0;
  let measuredRuns = 0;
  for (const r of runs) {
    const s = r.saved_usd ?? 0;
    total += s;
    byLane[r.lane] = (byLane[r.lane] ?? 0) + s;
    byModel[r.model] = (byModel[r.model] ?? 0) + s;
    if (r.usage_estimated) estimatedRuns++;
    else measuredRuns++;
  }
  return {
    totalSavedUsd: total,
    byLane,
    byModel,
    runs: runs.length,
    estimatedRuns,
    measuredRuns,
  };
}
