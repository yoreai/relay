import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTask } from "../src/run.ts";
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
    expect(outcome.model).toBe("grok-4.5");
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
});
