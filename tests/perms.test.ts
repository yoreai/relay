import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hardenRelayDataDir, relayDataDir } from "../src/paths.ts";
import { appendEvent, appendRun, hashTask, newRunId } from "../src/runlog.ts";

function mode(path: string): number {
  return statSync(path).mode & 0o777;
}

// The data dir holds run history, memory notes, and (with --log-tasks) task
// text. Default umask made all of it world-readable on shared machines —
// flagged in an external security review before wider install.
describe("data dir permissions", () => {
  test("run log and events are created owner-only", () => {
    const id = newRunId();
    appendRun({
      id,
      ts: new Date().toISOString(),
      status: "running",
      lane: "quickfix",
      backend: "fake",
      model: "gpt-5.6-luna",
      tier: "work",
      escalations: 0,
      task_hash: hashTask("perms test"),
    });
    appendEvent(id, "routed", "test");

    expect(mode(join(relayDataDir(), "runs.jsonl"))).toBe(0o600);
    expect(mode(join(relayDataDir(), "events", `${id}.jsonl`))).toBe(0o600);
    expect(mode(join(relayDataDir(), "events"))).toBe(0o700);
  });

  test("hardenRelayDataDir tightens files left behind by older relays", () => {
    const dir = relayDataDir();
    mkdirSync(dir, { recursive: true });
    const legacy = join(dir, "runs.jsonl.legacy.bak");
    writeFileSync(legacy, "{}\n");
    chmodSync(legacy, 0o644);
    chmodSync(dir, 0o755);

    hardenRelayDataDir();

    expect(mode(legacy)).toBe(0o600);
    expect(mode(dir)).toBe(0o700);
  });
});
