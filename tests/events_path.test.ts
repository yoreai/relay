import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { appendEvent, readEvents } from "../src/runlog.ts";
import { relayDataDir } from "../src/paths.ts";

/**
 * Run ids are relay-generated on the write path, but the read path takes
 * whatever the user typed after `relay status`.
 */
describe("event log ids", () => {
  test("a generated id round-trips", () => {
    const id = "run_20260724_abc123";
    appendEvent(id, "routed", "lane quickfix");
    expect(readEvents(id).map((e) => e.phase)).toEqual(["routed"]);
  });

  test("a traversal id reads nothing instead of walking out of the events dir", () => {
    const planted = join(relayDataDir(), "planted.jsonl");
    mkdirSync(dirname(planted), { recursive: true });
    writeFileSync(planted, JSON.stringify({ ts: "now", phase: "PLANTED" }) + "\n");

    for (const id of ["../planted", "../../etc/hosts", "/etc/hosts"]) {
      expect(readEvents(id)).toEqual([]);
    }
  });

  test("a traversal id writes nothing either", () => {
    expect(() => appendEvent("../escaped", "routed")).not.toThrow();
    expect(readEvents("../escaped")).toEqual([]);
  });
});
