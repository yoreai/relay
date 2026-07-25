import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  acquireRepoSlot,
  acquireRunLock,
  acquireSerialLock,
  lockPath,
  slotPath,
} from "../src/runlock.ts";
import { repoScope } from "../src/git.ts";
import { runTask } from "../src/run.ts";

/**
 * Parallel runs in one repo. The rule being protected is narrow: two runs must
 * never share a *working tree* (they fail each other's verify). Everything else
 * about "one run at a time" was collateral — worktree lanes get isolated trees,
 * so they may overlap, bounded by max_parallel and serialized at verify.
 */

function makeRepo(prefix = "relay-parallel-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const g = (args: string[]) => execFileSync("git", ["-C", dir, ...args]);
  g(["init", "-q"]);
  g(["config", "user.email", "t@t"]);
  g(["config", "user.name", "T"]);
  writeFileSync(join(dir, "a.txt"), "hello\n");
  g(["add", "-A"]);
  g(["commit", "-qm", "init"]);
  return dir;
}

/** A user-authored directive: repo-committed worktree lanes get clamped. */
function userConfigWith(maxParallel?: number): string {
  const configHome = mkdtempSync(join(tmpdir(), "relay-parallel-cfg-"));
  mkdirSync(join(configHome, "relay"), { recursive: true });
  writeFileSync(
    join(configHome, "relay", "router.yaml"),
    `version: 1
baseline: opus-5
${maxParallel === undefined ? "" : `max_parallel: ${maxParallel}\n`}tiers:
  work: { backend: cursor, model: composer-2.5 }
lanes:
  - name: build
    match: { verbs: [build] }
    tier: work
    write: worktree
  - name: quickfix
    match: { verbs: [fix] }
    tier: work
    write: tree
default_lane: quickfix
`,
  );
  return configHome;
}

async function withConfigHome<T>(configHome: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = configHome;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previous;
  }
}

describe("acquireRepoSlot", () => {
  test("admits up to the limit and refuses past it", () => {
    const repo = makeRepo();
    const a = acquireRepoSlot(repo, "run_a", 2);
    const b = acquireRepoSlot(repo, "run_b", 2);
    expect(() => acquireRepoSlot(repo, "run_c", 2)).toThrow(/max_parallel of 2/);
    b.release();
    // freeing one admits the next
    acquireRepoSlot(repo, "run_c", 2).release();
    a.release();
  });

  test("refusal names the runs to poll and how to raise the cap", () => {
    const repo = makeRepo();
    const held = acquireRepoSlot(repo, "run_holder", 1);
    try {
      expect(() => acquireRepoSlot(repo, "run_next", 1)).toThrow(/run_holder/);
      expect(() => acquireRepoSlot(repo, "run_next", 1)).toThrow(/router\.yaml/);
    } finally {
      held.release();
    }
  });

  test("reclaims slots held by dead processes", () => {
    const repo = makeRepo();
    // claim a slot, then fake its owner dying by rewriting the pid
    const held = acquireRepoSlot(repo, "run_zombie", 1);
    writeFileSync(
      slotPath(repo, "run_zombie"),
      JSON.stringify({ pid: 999_999_999, runId: "run_zombie", ts: "old" }),
    );
    acquireRepoSlot(repo, "run_live", 1).release();
    held.release();
  });

  test("a corrupt claim is treated as abandoned", () => {
    const repo = makeRepo();
    const held = acquireRepoSlot(repo, "run_corrupt", 1);
    writeFileSync(slotPath(repo, "run_corrupt"), "not json{");
    acquireRepoSlot(repo, "run_live", 1).release();
    held.release();
  });

  test("separate repos have separate caps", () => {
    const a = acquireRepoSlot(makeRepo(), "run_a", 1);
    const b = acquireRepoSlot(makeRepo(), "run_b", 1);
    a.release();
    b.release();
  });
});

describe("acquireSerialLock", () => {
  test("waits for the holder instead of refusing", async () => {
    const key = makeRepo();
    const order: string[] = [];
    const first = await acquireSerialLock("test", key, "run_a", 5_000);
    const second = acquireSerialLock("test", key, "run_b", 5_000).then((l) => {
      order.push("b-acquired");
      return l;
    });
    await new Promise((r) => setTimeout(r, 250));
    order.push("a-released");
    first.lock.release();
    const b = await second;
    expect(order).toEqual(["a-released", "b-acquired"]);
    expect(b.timedOut).toBe(false);
    expect(b.waitedMs).toBeGreaterThanOrEqual(200);
    b.lock.release();
  });

  test("proceeds unguarded on timeout without stealing the holder's lock", async () => {
    const key = makeRepo();
    const holder = await acquireSerialLock("test", key, "run_holder", 5_000);
    const timedOut = await acquireSerialLock("test", key, "run_late", 150);
    expect(timedOut.timedOut).toBe(true);
    // releasing a lock it never held must not free the holder's
    timedOut.lock.release();
    const stillHeld = await acquireSerialLock("test", key, "run_later", 150);
    expect(stillHeld.timedOut).toBe(true);
    holder.lock.release();
    const free = await acquireSerialLock("test", key, "run_after", 150);
    expect(free.timedOut).toBe(false);
    free.lock.release();
  });

  test("namespaces don't collide with the repo write lock", async () => {
    const repo = makeRepo();
    const write = acquireRunLock(repo, "run_write");
    const verify = await acquireSerialLock("verify", repo, "run_verify", 200);
    expect(verify.timedOut).toBe(false);
    verify.lock.release();
    write.release();
  });
});

describe("repoScope", () => {
  test("linked worktrees of one repo share a scope; clones don't", async () => {
    const repo = makeRepo();
    const wt = join(repo, "wt");
    execFileSync("git", ["-C", repo, "worktree", "add", "-q", wt, "-b", "side"]);
    expect(await repoScope(wt)).toBe(await repoScope(repo));
    expect(await repoScope(makeRepo())).not.toBe(await repoScope(repo));
  });
});

describe("runTask concurrency", () => {
  test("a worktree lane runs while another run holds the working tree", async () => {
    const repo = makeRepo();
    // A tree-editing run owns the working tree. A worktree lane doesn't touch
    // it, so it must not be turned away — this is the whole feature.
    const treeRun = acquireRunLock(repo, "run_tree");
    try {
      const outcome = await withConfigHome(userConfigWith(), () =>
        runTask({
          task: "build the widget",
          cwd: repo,
          lane: "build",
          backendOverride: "fake",
        }),
      );
      expect(outcome.id).toBeTruthy();
    } finally {
      treeRun.release();
    }
  }, 30_000);

  test("a worktree lane is refused once the repo is at max_parallel", async () => {
    const repo = makeRepo();
    const scope = await repoScope(repo);
    const held = acquireRepoSlot(scope, "run_first", 1);
    try {
      await expect(
        withConfigHome(userConfigWith(1), () =>
          runTask({
            task: "build the widget",
            cwd: repo,
            lane: "build",
            backendOverride: "fake",
          }),
        ),
      ).rejects.toThrow(/max_parallel of 1/);
    } finally {
      held.release();
    }
  }, 30_000);

  test("two runs still never share one working tree", async () => {
    const repo = makeRepo();
    const holder = acquireRunLock(repo, "run_active");
    try {
      await expect(
        withConfigHome(userConfigWith(4), () =>
          runTask({
            task: "fix the typo in a.txt",
            cwd: repo,
            lane: "quickfix",
            backendOverride: "fake",
          }),
        ),
      ).rejects.toThrow(/already writing in this repo/);
    } finally {
      holder.release();
    }
    // and the refused run left no slot behind
    expect(existsSync(lockPath(repo))).toBe(false);
    acquireRepoSlot(await repoScope(repo), "run_after", 1).release();
  }, 30_000);
});
