import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { acquireRunLock, lockPath } from "../src/runlock.ts";
import { runTask } from "../src/run.ts";

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "relay-lock-"));
  const g = (args: string[]) => execFileSync("git", ["-C", dir, ...args]);
  g(["init", "-q"]);
  g(["config", "user.email", "t@t"]);
  g(["config", "user.name", "T"]);
  writeFileSync(join(dir, "a.txt"), "hello\n");
  g(["add", "-A"]);
  g(["commit", "-qm", "init"]);
  return dir;
}

describe("acquireRunLock", () => {
  test("holds and releases", () => {
    const repo = makeRepo();
    const lock = acquireRunLock(repo, "run_a");
    expect(existsSync(lockPath(repo))).toBe(true);
    expect(() => acquireRunLock(repo, "run_b")).toThrow(/already writing in this repo/);
    lock.release();
    expect(existsSync(lockPath(repo))).toBe(false);
    acquireRunLock(repo, "run_c").release();
  });

  test("conflict error names the holder run id", () => {
    const repo = makeRepo();
    const lock = acquireRunLock(repo, "run_holder");
    try {
      expect(() => acquireRunLock(repo, "run_b")).toThrow(/run_holder/);
    } finally {
      lock.release();
    }
  });

  test("reclaims a stale lock from a dead process", () => {
    const repo = makeRepo();
    writeFileSync(
      lockPath(repo),
      JSON.stringify({ pid: 999_999_999, runId: "run_dead", cwd: repo, ts: "old" }),
    );
    const lock = acquireRunLock(repo, "run_new");
    expect(JSON.parse(readFileSync(lockPath(repo), "utf8")).runId).toBe("run_new");
    lock.release();
  });

  test("reclaims a corrupt lock file", () => {
    const repo = makeRepo();
    writeFileSync(lockPath(repo), "not json{");
    acquireRunLock(repo, "run_new").release();
  });

  test("different repos don't contend", () => {
    const a = acquireRunLock(makeRepo(), "run_a");
    const b = acquireRunLock(makeRepo(), "run_b");
    a.release();
    b.release();
  });
});

describe("runTask locking", () => {
  test("write run is refused while another holds the repo lock, accepted after", async () => {
    const repo = makeRepo();
    const holder = acquireRunLock(repo, "run_active");
    try {
      await expect(
        runTask({ task: "fix the typo in a.txt", cwd: repo, backendOverride: "fake" }),
      ).rejects.toThrow(/already writing in this repo/);
    } finally {
      holder.release();
    }
    const again = await runTask({
      task: "fix the typo in a.txt",
      cwd: repo,
      backendOverride: "fake",
    });
    expect(again.id).toBeTruthy();
    // The run released its own lock on the way out.
    expect(existsSync(lockPath(repo))).toBe(false);
  }, 30_000);

  test("read-only lanes never lock", async () => {
    const repo = makeRepo();
    const lock = acquireRunLock(repo, "run_writer");
    try {
      const outcome = await runTask({
        task: "review a.txt and report issues",
        cwd: repo,
        lane: "review",
        backendOverride: "fake",
      });
      expect(outcome.id).toBeTruthy();
    } finally {
      lock.release();
    }
  }, 30_000);
});
