// Concurrency guards, one per shared resource — deliberately not one lock:
//
// 1. The working tree. Two writing runs in one tree corrupt each other's
//    verify (seen live — overlapping quickfix runs both recorded "verify
//    failed" on edits that pass cleanly in isolation). `acquireRunLock` keeps
//    tree-editing lanes exclusive per tree, keyed by the tree's own path.
// 2. The repo as a whole. Worktree lanes each get an isolated tree, so they
//    don't contend on (1) at all — but N of them still multiply spend and
//    machine load, so `acquireRepoSlot` caps how many writing runs a repo
//    hosts at once (the directive's `max_parallel`).
// 3. The repo's verify commands. Isolated trees do NOT isolate a test suite
//    that binds a port, touches a dev database, or shares fixtures — and a
//    verify that fails for that reason reads as the model's fault and buys an
//    escalation. `acquireSerialLock` serializes verify across the repo.
//
// Read-only lanes take none of these, so status/review queries still work
// while a long run is active.

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { relayDataDir } from "./paths.ts";

export type RunLock = {
  release: () => void;
  [Symbol.dispose]: () => void;
};

type LockInfo = { pid: number; runId: string; cwd: string; ts: string };

function locksDir(): string {
  return join(relayDataDir(), "locks");
}

function keyHash(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

export function lockPath(repoCwd: string): string {
  return join(locksDir(), `${keyHash(repoCwd)}.json`);
}

/** Namespaced sibling of `lockPath`, so a verify gate can't collide with a
 *  write lock that happens to be keyed by the same path. */
function namedLockPath(namespace: string, key: string): string {
  return join(locksDir(), `${namespace}-${keyHash(key)}.json`);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** No-op lock for read-only lanes, so callers can `using` unconditionally. */
export function noLock(): RunLock {
  const release = () => {};
  return { release, [Symbol.dispose]: release };
}

/**
 * Atomically claim the write lock for a repo. Throws a host-actionable error
 * if another live run holds it; silently reclaims locks whose owner process
 * is gone (crashed server, killed worker).
 */
export function acquireRunLock(repoCwd: string, runId: string): RunLock {
  const path = lockPath(repoCwd);
  mkdirSync(locksDir(), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(
        path,
        JSON.stringify({
          pid: process.pid,
          runId,
          cwd: repoCwd,
          ts: new Date().toISOString(),
        } satisfies LockInfo),
        { flag: "wx" },
      );
      const release = () => {
        try {
          rmSync(path);
        } catch {
          // already gone — fine
        }
      };
      return { release, [Symbol.dispose]: release };
    } catch {
      let holder: LockInfo | null = null;
      try {
        holder = JSON.parse(readFileSync(path, "utf8")) as LockInfo;
      } catch {
        // unreadable/corrupt lock — treat as stale
      }
      if (!holder || !pidAlive(holder.pid)) {
        try {
          rmSync(path);
        } catch {
          // lost a race to another reclaimer — retry loop handles it
        }
        continue;
      }
      throw new Error(
        `another relay run (${holder.runId}, started ${holder.ts}) is already ` +
          `writing in this repo — two writing runs in one working tree would ` +
          `corrupt each other's verify. Poll relay_status with id "${holder.runId}" ` +
          `and retry when it finishes.`,
      );
    }
  }
  throw new Error("could not acquire the repo write lock (contended reclaim) — retry");
}

type SlotInfo = { pid: number; runId: string; ts: string };

function slotsDir(repoKey: string): string {
  return join(relayDataDir(), "slots", keyHash(repoKey));
}

export function slotPath(repoKey: string, runId: string): string {
  return join(slotsDir(repoKey), `${runId}.json`);
}

/**
 * Live claims in FIFO order. Ordering is by (timestamp, runId) so every
 * contender independently agrees on who is holding a slot — that agreement is
 * what makes the claim-then-verify below safe without a central lock.
 */
function liveSlots(dir: string): SlotInfo[] {
  const found: SlotInfo[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return found;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const path = join(dir, name);
    let info: SlotInfo | null = null;
    try {
      info = JSON.parse(readFileSync(path, "utf8")) as SlotInfo;
    } catch {
      // unreadable/corrupt claim — treat as abandoned
    }
    if (!info || !pidAlive(info.pid)) {
      try {
        rmSync(path);
      } catch {
        // lost a race to another reclaimer — fine
      }
      continue;
    }
    found.push(info);
  }
  return found.sort((a, b) =>
    a.ts === b.ts ? a.runId.localeCompare(b.runId) : a.ts.localeCompare(b.ts),
  );
}

/**
 * Claim one of `limit` writing slots for a repo. Throws a host-actionable
 * error when the repo is already at its cap, naming the runs to poll and the
 * knob that raises it.
 *
 * `repoKey` is the *shared* repo (git common dir), not the working tree, so
 * linked worktrees of one repo count against one cap while separate clones
 * stay independent.
 */
export function acquireRepoSlot(repoKey: string, runId: string, limit: number): RunLock {
  const dir = slotsDir(repoKey);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const mine = join(dir, `${runId}.json`);
  writeFileSync(
    mine,
    JSON.stringify({
      pid: process.pid,
      runId,
      ts: new Date().toISOString(),
    } satisfies SlotInfo),
    { mode: 0o600 },
  );
  const release = () => {
    try {
      rmSync(mine);
    } catch {
      // already gone — fine
    }
  };

  const live = liveSlots(dir);
  const rank = live.findIndex((s) => s.runId === runId);
  if (rank >= 0 && rank < limit) {
    return { release, [Symbol.dispose]: release };
  }
  release();
  const others = live.filter((s) => s.runId !== runId).slice(0, limit);
  throw new Error(
    `this repo is already running ${others.length} writing relay run(s) ` +
      `(${others.map((s) => s.runId).join(", ")}), which is its max_parallel of ` +
      `${limit} — parallel runs multiply spend and share your test suite. Poll ` +
      `relay_status for those ids and retry, or raise max_parallel in your router.yaml.`,
  );
}

export type SerialLock = {
  lock: RunLock;
  waitedMs: number;
  /** true when the wait timed out and the caller proceeded unguarded */
  timedOut: boolean;
};

/**
 * Exclusive lock that *waits* instead of refusing, for resources a run can't
 * simply be turned away from (it has already spent tokens by then).
 *
 * On timeout the caller proceeds unguarded: this class of lock exists to keep
 * concurrent runs from confusing each other, not as a safety boundary, and
 * throwing away completed model work would be the worse failure.
 */
export async function acquireSerialLock(
  namespace: string,
  key: string,
  runId: string,
  timeoutMs: number,
): Promise<SerialLock> {
  const path = namedLockPath(namespace, key);
  mkdirSync(locksDir(), { recursive: true, mode: 0o700 });
  const startedAt = Date.now();

  while (true) {
    try {
      writeFileSync(
        path,
        JSON.stringify({
          pid: process.pid,
          runId,
          cwd: key,
          ts: new Date().toISOString(),
        } satisfies LockInfo),
        { flag: "wx", mode: 0o600 },
      );
      const release = () => {
        try {
          rmSync(path);
        } catch {
          // already gone — fine
        }
      };
      return {
        lock: { release, [Symbol.dispose]: release },
        waitedMs: Date.now() - startedAt,
        timedOut: false,
      };
    } catch {
      let holder: LockInfo | null = null;
      try {
        holder = JSON.parse(readFileSync(path, "utf8")) as LockInfo;
      } catch {
        // unreadable/corrupt lock — treat as stale
      }
      if (!holder || !pidAlive(holder.pid)) {
        try {
          rmSync(path);
        } catch {
          // lost a race to another reclaimer — retry loop handles it
        }
        continue;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        return { lock: noLock(), waitedMs: Date.now() - startedAt, timedOut: true };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
