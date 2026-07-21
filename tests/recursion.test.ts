import { afterEach, describe, expect, test } from "bun:test";
import { renderBriefPrompt } from "../src/brief.ts";
import { runTask } from "../src/run.ts";

afterEach(() => {
  delete process.env.RELAY_WORKER;
  delete process.env.RELAY_ALLOW_NESTED;
});

describe("recursion guard", () => {
  test("runTask refuses inside a relay worker", async () => {
    process.env.RELAY_WORKER = "1";
    await expect(runTask({ task: "status check" })).rejects.toThrow(
      /recursion guard/,
    );
  });

  test("RELAY_ALLOW_NESTED overrides (escape hatch)", async () => {
    process.env.RELAY_WORKER = "1";
    process.env.RELAY_ALLOW_NESTED = "1";
    process.env.RELAY_ALLOW_FAKE = "1";
    // fake backend keeps this hermetic; we only care that the guard is bypassed
    const outcome = await runTask({ task: "status check", backendOverride: "fake" });
    expect(outcome.id).toBeTruthy();
  });

  test("every worker prompt opens with the guard line", () => {
    const prompt = renderBriefPrompt({ goal: "fix tests", done_means: [] });
    expect(prompt).toStartWith("[relay worker]");
    expect(prompt).toContain("Never call relay");
  });
});
