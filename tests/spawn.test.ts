import { describe, expect, test } from "bun:test";
import { runCli } from "../src/backends/spawn.ts";

describe("runCli", () => {
  test("returns output and exit code", async () => {
    const r = await runCli(["echo", "hello"]);
    expect(r.stdout.trim()).toBe("hello");
    expect(r.exitCode).toBe(0);
    expect(r.timedOut).toBe(false);
  });

  test("kills silent processes after inactivity and reports timeout", async () => {
    const r = await runCli(
      ["sh", "-c", 'trap "exit 0" TERM; while true; do sleep 1; done'],
      { timeoutMs: 300 },
    );
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).toBe(124);
    expect(r.stderr).toContain("no output for 300ms");
    expect(r.stderr).toContain("RELAY_BACKEND_TIMEOUT_MS");
  });

  test("does not kill a slow process that keeps producing output", async () => {
    const r = await runCli(
      ["sh", "-c", "for i in 1 2 3 4 5 6 7 8; do echo tick; sleep 0.1; done"],
      { timeoutMs: 300 },
    );
    expect(r.timedOut).toBe(false);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("tick");
  });

  test("streams stdout/stderr chunks live via onStdout/onStderr", async () => {
    const outChunks: string[] = [];
    const errChunks: string[] = [];
    const r = await runCli(["sh", "-c", "echo out-line; echo err-line 1>&2"], {
      onStdout: (c) => outChunks.push(c),
      onStderr: (c) => errChunks.push(c),
    });
    expect(outChunks.join("")).toContain("out-line");
    expect(errChunks.join("")).toContain("err-line");
    // callback output must match the aggregated result exactly
    expect(outChunks.join("")).toBe(r.stdout);
    expect(errChunks.join("")).toBe(r.stderr);
  });

  test("default env tags the child RELAY_WORKER=1", async () => {
    const r = await runCli(["sh", "-c", "echo $RELAY_WORKER"]);
    expect(r.stdout.trim()).toBe("1");
  });

  test("an explicit env overrides the RELAY_WORKER default", async () => {
    const r = await runCli(["sh", "-c", "echo worker=$RELAY_WORKER"], {
      env: process.env,
    });
    expect(r.stdout.trim()).toBe("worker=");
  });
});
