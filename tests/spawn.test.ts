import { describe, expect, test } from "bun:test";
import { runCli } from "../src/backends/spawn.ts";

describe("runCli", () => {
  test("returns output and exit code", async () => {
    const r = await runCli(["echo", "hello"]);
    expect(r.stdout.trim()).toBe("hello");
    expect(r.exitCode).toBe(0);
    expect(r.timedOut).toBe(false);
  });

  test("kills hung processes and reports timeout", async () => {
    const r = await runCli(["sleep", "30"], { timeoutMs: 300 });
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("timed out");
  });
});
