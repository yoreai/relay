import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/cli.ts";

describe("parseArgs flag placement", () => {
  test("a flag after the task is honored, not swallowed into the task", () => {
    const p = parseArgs(["fix the add function", "--dry-run"]);
    expect(p.task).toBe("fix the add function");
    expect(p.dryRun).toBe(true);
  });

  test("an unquoted task still collects into one string, flags intact", () => {
    const p = parseArgs(["fix", "the", "add", "function", "--lane", "build"]);
    expect(p.task).toBe("fix the add function");
    expect(p.lane).toBe("build");
  });

  test("value flags after the task keep their value", () => {
    const p = parseArgs(["ship it", "--tier", "deep", "--walkaway", "--log-tasks"]);
    expect(p.task).toBe("ship it");
    expect(p.tier).toBe("deep");
    expect(p.walkaway).toBe(true);
    expect(p.logTasks).toBe(true);
  });

  test("flags before the task keep working", () => {
    const p = parseArgs(["--dry-run", "--lane", "status", "what changed"]);
    expect(p.task).toBe("what changed");
    expect(p.dryRun).toBe(true);
    expect(p.lane).toBe("status");
  });
});

describe("parseArgs commands and the optional run verb", () => {
  test("`run` is accepted as the implicit verb and left out of the task", () => {
    const p = parseArgs(["run", "fix the add function", "--dry-run"]);
    expect(p.task).toBe("fix the add function");
    expect(p.dryRun).toBe(true);
  });

  test("subcommands still parse, with their args as rest", () => {
    const p = parseArgs(["remember", "we chose bun", "--kind", "decision"]);
    expect(p.command).toBe("remember");
    expect(p.rest).toEqual(["we chose bun", "--kind", "decision"]);
    expect(p.task).toBeUndefined();
  });

  test("a command word inside a task is task text, not a command", () => {
    const p = parseArgs(["make", "doctor", "output", "quieter"]);
    expect(p.command).toBeUndefined();
    expect(p.task).toBe("make doctor output quieter");
  });
});

describe("parseArgs unknown flags", () => {
  test("a typo'd flag fails loudly instead of becoming task text", () => {
    expect(() => parseArgs(["fix it", "--dry-runn"])).toThrow(/unknown flag: --dry-runn/);
  });

  test("the error tells the user to quote a task containing a dash", () => {
    expect(() => parseArgs(["fix the", "-v", "handling"])).toThrow(/quote the task/);
  });

  test("an unknown leading flag still fails", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown flag: --nope/);
  });
});
