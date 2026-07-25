import { describe, expect, test } from "bun:test";
import { CLI_SPECS } from "../src/backends/cli.ts";

describe("opencode CLI spec", () => {
  const spec = CLI_SPECS.opencode!;

  test("buildArgs maps catalog ids to pinned zen provider ids", () => {
    expect(spec.buildArgs("fix the test", "glm-5.2")).toEqual([
      "run",
      "--model",
      "opencode/glm-5.2",
      "fix the test",
    ]);
  });

  test("claude-family ids get the zen claude- prefix and drop -high", () => {
    expect(spec.buildArgs("fix the test", "opus-5")).toContain(
      "opencode/claude-opus-5",
    );
    expect(spec.buildArgs("fix the test", "fable-5-high")).toContain(
      "opencode/claude-fable-5",
    );
  });

  test("unknown ids pass through so users can pin their own provider/model", () => {
    expect(spec.buildArgs("fix the test", "openai/gpt-5.6-sol")).toContain(
      "openai/gpt-5.6-sol",
    );
    expect(spec.buildArgs("fix the test", "some-future-model")).toContain(
      "some-future-model",
    );
  });

  test("flags are verified against a real install", () => {
    // Verified 2026-07-25 against opencode 1.18.5, live `opencode run`.
    expect(spec.verified).toBe(true);
  });
});
