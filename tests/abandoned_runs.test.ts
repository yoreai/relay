import { describe, expect, test } from "bun:test";
import { appendRun, getRun, modelStats, newRunId, type RunRecord } from "../src/runlog.ts";

function record(over: Partial<RunRecord> = {}): RunRecord {
  return {
    id: newRunId(),
    ts: new Date().toISOString(),
    status: "running",
    lane: "quickfix",
    backend: "fake",
    model: "gpt-5.6-luna",
    tier: "work",
    escalations: 0,
    task_hash: "abc123",
    ...over,
  };
}

/**
 * A pid nothing is using. Reusing a just-exited process's pid looked simpler
 * but flaked: those are exactly the pids the OS recycles first, so under load
 * the "dead" controller came back to life. Probe for one that's actually free.
 */
function unusedPid(): number {
  for (let pid = 90_000; pid > 1; pid--) {
    try {
      process.kill(pid, 0);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ESRCH") return pid;
    }
  }
  throw new Error("no unused pid found");
}

describe("abandoned runs", () => {
  test("a running record whose controller is gone reads back as interrupted", () => {
    const r = record({ owner_pid: unusedPid() });
    appendRun(r);
    const read = getRun(r.id);
    expect(read?.status).toBe("interrupted");
    expect(read?.error).toContain("exited before the run finished");
  });

  test("a running record with a live controller is left alone", () => {
    const r = record({ owner_pid: process.pid });
    appendRun(r);
    expect(getRun(r.id)?.status).toBe("running");
  });

  test("a finished run is never reinterpreted, even if its controller is gone", () => {
    const r = record({ owner_pid: unusedPid(), status: "ok", verify_ok: true });
    appendRun(r);
    expect(getRun(r.id)?.status).toBe("ok");
  });

  test("a legacy record with no controller stays running while it's still recent", () => {
    const r = record();
    appendRun(r);
    expect(getRun(r.id)?.status).toBe("running");
  });

  test("a legacy record with no controller is interrupted once it's hours old", () => {
    const r = record({ ts: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString() });
    appendRun(r);
    const read = getRun(r.id);
    expect(read?.status).toBe("interrupted");
    expect(read?.error).toContain("no controller recorded");
  });

  test("an abandoned run is not counted against its model in advise stats", () => {
    const model = `test-model-${Math.random().toString(36).slice(2, 8)}`;
    appendRun(record({ owner_pid: unusedPid(), model }));
    expect(modelStats()[model]).toBeUndefined();
  });
});
