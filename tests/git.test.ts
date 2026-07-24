import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listChangedFiles, maybeOpenDraftPr, stagePaths } from "../src/git.ts";

async function sh(cwd: string, args: string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "ignore", stderr: "ignore" });
  await proc.exited;
}

async function makeRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "relay-git-test-"));
  await sh(dir, ["init", "-q"]);
  await sh(dir, ["config", "user.email", "t@t.local"]);
  await sh(dir, ["config", "user.name", "t"]);
  return dir;
}

describe("listChangedFiles", () => {
  test("keeps the full path of an unstaged modification (leading-space porcelain status)", async () => {
    const dir = await makeRepo();
    writeFileSync(join(dir, "math.js"), "x\n");
    await sh(dir, ["add", "-A"]);
    await sh(dir, ["commit", "-qm", "init"]);
    writeFileSync(join(dir, "math.js"), "y\n");

    // ` M math.js` — a whole-output trim() used to eat the leading space
    // and slice() then reported `ath.js`
    expect(await listChangedFiles(dir)).toEqual(["math.js"]);
  });

  test("lists untracked and modified files together", async () => {
    const dir = await makeRepo();
    writeFileSync(join(dir, "a.txt"), "a\n");
    await sh(dir, ["add", "-A"]);
    await sh(dir, ["commit", "-qm", "init"]);
    writeFileSync(join(dir, "a.txt"), "changed\n");
    writeFileSync(join(dir, "new.txt"), "new\n");

    const files = (await listChangedFiles(dir)).sort();
    expect(files).toEqual(["a.txt", "new.txt"]);
  });

  test("reports the new path for staged renames", async () => {
    const dir = await makeRepo();
    writeFileSync(join(dir, "old.txt"), "content\n");
    await sh(dir, ["add", "-A"]);
    await sh(dir, ["commit", "-qm", "init"]);
    await sh(dir, ["mv", "old.txt", "new.txt"]);

    expect(await listChangedFiles(dir)).toEqual(["new.txt"]);
  });
});

describe("createWorktree", () => {
  test("excludes .relay/ from git status via local exclude", async () => {
    const dir = await makeRepo();
    writeFileSync(join(dir, "a.txt"), "a\n");
    await sh(dir, ["add", "-A"]);
    await sh(dir, ["commit", "-qm", "init"]);

    const { createWorktree } = await import("../src/git.ts");
    const dest = await createWorktree(dir, "relay/test-branch");
    expect(dest).toContain(".relay");

    // main tree status must not report the .relay scratch dir
    expect(await listChangedFiles(dir)).toEqual([]);
  });
});

describe("stagePaths", () => {
  test("stages exactly the files a run touched", async () => {
    const dir = await makeRepo();
    writeFileSync(join(dir, "math.js"), "x\n");
    await sh(dir, ["add", "-A"]);
    await sh(dir, ["commit", "-qm", "init"]);
    writeFileSync(join(dir, "math.js"), "y\n");

    const changed = await listChangedFiles(dir);
    await stagePaths(dir, changed);

    const proc = Bun.spawn(["git", "diff", "--cached", "--name-only"], {
      cwd: dir,
      stdout: "pipe",
    });
    const staged = (await new Response(proc.stdout).text()).trim();
    expect(staged).toBe("math.js");
  });
});

describe("maybeOpenDraftPr", () => {
  test("pushes the relay/* branch to origin before attempting the PR", async () => {
    // bare "origin" + a clone on a relay/* branch — gh will fail (no GitHub
    // remote), but the branch must land on origin so a PR is even possible
    const origin = mkdtempSync(join(tmpdir(), "relay-git-origin-"));
    await sh(origin, ["init", "-q", "--bare"]);
    const dir = await makeRepo();
    writeFileSync(join(dir, "a.txt"), "x\n");
    await sh(dir, ["add", "-A"]);
    await sh(dir, ["commit", "-qm", "init"]);
    await sh(dir, ["remote", "add", "origin", origin]);
    await sh(dir, ["checkout", "-qb", "relay/build-test"]);

    await maybeOpenDraftPr(dir, "t", "b");

    const proc = Bun.spawn(["git", "branch", "-a"], { cwd: origin, stdout: "pipe" });
    const branches = await new Response(proc.stdout).text();
    expect(branches).toContain("relay/build-test");
  });

  test("refuses to push non-relay branches", async () => {
    const origin = mkdtempSync(join(tmpdir(), "relay-git-origin2-"));
    await sh(origin, ["init", "-q", "--bare"]);
    const dir = await makeRepo();
    writeFileSync(join(dir, "a.txt"), "x\n");
    await sh(dir, ["add", "-A"]);
    await sh(dir, ["commit", "-qm", "init"]);
    await sh(dir, ["remote", "add", "origin", origin]);
    // stays on the default branch — the user's branch is never pushed

    const url = await maybeOpenDraftPr(dir, "t", "b");
    expect(url).toBeNull();

    const proc = Bun.spawn(["git", "branch", "-a"], { cwd: origin, stdout: "pipe" });
    const branches = await new Response(proc.stdout).text();
    expect(branches.trim()).toBe("");
  });
});
