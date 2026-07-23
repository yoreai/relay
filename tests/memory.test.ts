import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readNotes, recallDigest, rememberNote } from "../src/memory.ts";
import { appendRun, newRunId } from "../src/runlog.ts";

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "relay-mem-"));
  const g = (args: string[]) => execFileSync("git", ["-C", dir, ...args]);
  g(["init", "-q"]);
  g(["config", "user.email", "t@relay.local"]);
  g(["config", "user.name", "T"]);
  writeFileSync(join(dir, "a.txt"), "one\n");
  g(["add", "-A"]);
  g(["commit", "-qm", "add alpha file"]);
  return dir;
}

describe("rememberNote / readNotes", () => {
  test("roundtrips a note with kind", async () => {
    const repo = makeRepo();
    await rememberNote(repo, "we chose sqlite over graph db", { kind: "decision" });
    const notes = await readNotes(repo);
    expect(notes.length).toBe(1);
    expect(notes[0]!.note).toContain("sqlite");
    expect(notes[0]!.kind).toBe("decision");
  });

  test("unknown kind falls back to note; empty and huge notes refused", async () => {
    const repo = makeRepo();
    const saved = await rememberNote(repo, "x", { kind: "banana" });
    expect(saved.kind).toBe("note");
    await expect(rememberNote(repo, "   ")).rejects.toThrow(/empty/);
    await expect(rememberNote(repo, "y".repeat(3000))).rejects.toThrow(/too long/);
  });

  test("notes are keyed by git root — subdir sees the same memory", async () => {
    const repo = makeRepo();
    execFileSync("mkdir", ["-p", join(repo, "sub", "dir")]);
    await rememberNote(repo, "root note");
    const fromSub = await readNotes(join(repo, "sub", "dir"));
    expect(fromSub.length).toBe(1);
  });
});

describe("recallDigest", () => {
  test("git layer: branch, commits, dirty files", async () => {
    const repo = makeRepo();
    writeFileSync(join(repo, "a.txt"), "changed\n");
    const d = await recallDigest(repo, { sessions: false });
    expect(d).toContain("add alpha file");
    expect(d).toContain("1 uncommitted change(s): a.txt");
    expect(d).toMatch(/on branch (main|master)/);
  });

  test("runs layer: matches this repo's cwd only; failed runs flagged", async () => {
    const repo = makeRepo();
    const base = {
      ts: new Date().toISOString(),
      lane: "quickfix",
      backend: "fake",
      model: "glm-5.2",
      tier: "work",
      escalations: 0,
      task_hash: "x",
    };
    appendRun({ ...base, id: newRunId(), status: "ok", cwd: repo, task: "fix the thing" });
    appendRun({ ...base, id: newRunId(), status: "failed", cwd: repo });
    appendRun({ ...base, id: newRunId(), status: "ok", cwd: "/somewhere/else" });
    const d = await recallDigest(repo, { sessions: false });
    expect(d).toContain('"fix the thing"');
    expect(d).toContain("FAILED");
    expect(d).toContain("open threads: 1 failed run(s)");
    // the other repo's run must not leak in
    expect((d.match(/quickfix\/glm-5\.2/g) ?? []).length).toBe(2);
  });

  test("notes layer: recent verbose, older collapsed", async () => {
    const repo = makeRepo();
    for (let i = 1; i <= 13; i++) await rememberNote(repo, `note number ${i}`);
    const d = await recallDigest(repo, { sessions: false });
    expect(d).toContain("note number 13");
    expect(d).toContain("(+3 older notes)");
    expect(d).not.toContain("note number 1 ");
  });

  test("non-repo dir degrades gracefully", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-mem-norepo-"));
    const d = await recallDigest(dir, { sessions: false });
    expect(d).toContain("not a git repository");
  });

  test("output is capped", async () => {
    const repo = makeRepo();
    for (let i = 0; i < 60; i++) {
      await rememberNote(repo, `long note ${i} ${"z".repeat(150)}`);
    }
    const d = await recallDigest(repo, { sessions: false });
    expect(d.length).toBeLessThanOrEqual(6_100);
  });
});
