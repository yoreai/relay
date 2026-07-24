import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { errorExcerpt, formatOutcome, runTask } from "../src/run.ts";
import { readEvents } from "../src/runlog.ts";

describe("run with fake backend", () => {
  test("dry-run prints routing", async () => {
    const outcome = await runTask({
      task: "fix the flaky test",
      dryRun: true,
      backendOverride: "fake",
    });
    expect(outcome.dryRun).toBe(true);
    expect(outcome.output).toContain("lane: quickfix");
    expect(outcome.model).toBe("composer-2.5");
  });

  test("end-to-end fake backend succeeds", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-"));
    // minimal git repo so staging works
    await Bun.$`git init`.cwd(dir).quiet();
    await Bun.$`git config user.email test@example.com`.cwd(dir).quiet();
    await Bun.$`git config user.name test`.cwd(dir).quiet();
    writeFileSync(join(dir, "README.md"), "# t\n");
    await Bun.$`git add README.md && git commit -m init`.cwd(dir).quiet();

    process.env.RELAY_ALLOW_FAKE = "1";
    process.env.RELAY_FAKE_WRITE = join(dir, "edited.txt");

    const outcome = await runTask({
      task: "fix nothing real",
      cwd: dir,
      backendOverride: "fake",
      lane: "status", // write: none — still runs
    });

    expect(outcome.backend).toBe("fake");
    expect(outcome.verifyOk).toBe(true);
    expect(outcome.id).toStartWith("run_");
  });

  test("worktree lane commits to a relay/* branch and reports how to reconcile", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-wt-"));
    await Bun.$`git init`.cwd(dir).quiet();
    await Bun.$`git config user.email test@example.com`.cwd(dir).quiet();
    await Bun.$`git config user.name test`.cwd(dir).quiet();
    writeFileSync(join(dir, "README.md"), "# t\n");
    await Bun.$`git add README.md && git commit -m init`.cwd(dir).quiet();

    process.env.RELAY_ALLOW_FAKE = "1";
    process.env.RELAY_FAKE_WRITE = "built.txt"; // relative → lands in the worktree

    try {
      const outcome = await runTask({
        task: "implement the thing",
        cwd: dir,
        backendOverride: "fake",
        lane: "build",
      });

      expect(outcome.verifyOk).toBe(true);
      expect(outcome.workBranch).toMatch(/^relay\/build-/);
      expect(outcome.workDir).toContain(".relay/worktrees");

      // work is committed on the branch, not floating in a scratch dir
      const log = await Bun.$`git log --oneline ${outcome.workBranch}`.cwd(dir).text();
      expect(log).toContain("relay: implement the thing");
      const show = await Bun.$`git show --stat --oneline ${outcome.workBranch}`.cwd(dir).text();
      expect(show).toContain("built.txt");

      // main branch untouched
      const mainLog = await Bun.$`git log --oneline`.cwd(dir).text();
      expect(mainLog).not.toContain("relay: implement");

      // humans and agents are told where the work lives + that it won't auto-merge
      const summary = formatOutcome(outcome);
      expect(summary).toContain(outcome.workBranch!);
      expect(summary).toContain("does NOT auto-merge");
    } finally {
      delete process.env.RELAY_FAKE_WRITE;
    }
  });

  test("emits a pollable progress feed and fires onStart before completion", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-"));
    await Bun.$`git init`.cwd(dir).quiet();
    await Bun.$`git config user.email test@example.com`.cwd(dir).quiet();
    await Bun.$`git config user.name test`.cwd(dir).quiet();
    writeFileSync(join(dir, "README.md"), "# t\n");
    await Bun.$`git add README.md && git commit -m init`.cwd(dir).quiet();

    process.env.RELAY_ALLOW_FAKE = "1";
    process.env.RELAY_FAKE_WRITE = join(dir, "edited.txt");

    let idAtStart: string | undefined;
    const seen: string[] = [];
    const outcome = await runTask({
      task: "fix nothing real",
      cwd: dir,
      backendOverride: "fake",
      lane: "status",
      onStart: (id) => {
        idAtStart = id;
      },
      onEvent: (phase) => {
        seen.push(phase);
      },
    });

    expect(idAtStart).toBe(outcome.id);

    // persisted feed — what relay_status returns to polling agents
    const phases = readEvents(outcome.id).map((e) => e.phase);
    expect(phases[0]).toBe("routed");
    expect(phases).toContain("working");
    expect(phases).toContain("verify_done");
    expect(phases.at(-1)).toBe("done");

    // live mirror matches the persisted feed
    expect(seen).toEqual(phases);
  });

  test("failed runs surface the backend's actual error", () => {
    const noisy =
      "OpenAI Codex v0.139.0\n--------\nsession id: abc\n\n" +
      'ERROR: {"type":"error","status":400,"error":{"message":"The model requires a newer version of Codex."}}\n';
    const excerpt = errorExcerpt(noisy, 160);
    expect(excerpt).toContain("newer version of Codex");

    const summary = formatOutcome({
      id: "run_x",
      lane: "quickfix",
      tier: "work",
      backend: "codex",
      model: "gpt-5.6-sol",
      verifyOk: false,
      escalations: 1,
      filesChanged: [],
      output: noisy,
      dryRun: false,
    } as any);
    expect(summary).toContain("why:");
    expect(summary).toContain("newer version of Codex");
  });
});
