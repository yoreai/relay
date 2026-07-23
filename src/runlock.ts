// Per-repo run lock: two writing runs in one working tree corrupt each
// other's verify (seen live — overlapping quickfix runs both recorded
// "verify failed" on edits that pass cleanly in isolation). One writing run
// per repo at a time; read-only lanes never lock, so status/review queries
// still work while a long run is active.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

export function lockPath(repoCwd: string): string {
  const key = createHash("sha256").update(repoCwd).digest("hex").slice(0, 16);
  return join(locksDir(), `${key}.json`);
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
