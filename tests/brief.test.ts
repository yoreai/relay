import { describe, expect, test } from "bun:test";
import { parseBrief, renderBriefPrompt } from "../src/brief.ts";

describe("parseBrief", () => {
  test("accepts canonical array fields", () => {
    const b = parseBrief({
      goal: "fix the bug",
      files: ["a.ts"],
      constraints: ["no deps"],
      done_means: ["tests pass"],
    });
    expect(b.done_means).toEqual(["tests pass"]);
  });

  test("coerces bare strings to single-item lists (real-world MCP callers do this)", () => {
    const b = parseBrief({
      goal: "fix the bug",
      files: "a.ts",
      constraints: "read-only",
      done_means: "tests pass",
    });
    expect(b.files).toEqual(["a.ts"]);
    expect(b.constraints).toEqual(["read-only"]);
    expect(b.done_means).toEqual(["tests pass"]);
  });

  test("rendered prompt opens with the worker recursion guard", () => {
    const b = parseBrief({ goal: "do a thing", done_means: [] });
    expect(renderBriefPrompt(b)).toMatch(/^\[relay worker\]/);
  });
});
