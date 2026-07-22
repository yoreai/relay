import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listChangedFiles, stagePaths } from "../src/git.ts";

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
