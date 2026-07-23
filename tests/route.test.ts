import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadDirectiveFromText } from "../src/directive.ts";
import { routeTask } from "../src/route.ts";

const directive = loadDirectiveFromText(
  readFileSync(join(import.meta.dir, "..", "defaults", "router.yaml"), "utf8"),
);

describe("route", () => {
  test("fix → quickfix / work", () => {
    const d = routeTask(directive, "fix the flaky retry test");
    expect(d.lane.name).toBe("quickfix");
    expect(d.tier).toBe("work");
    expect(d.confidence).toBe("high");
  });

  test("review → review lane", () => {
    const d = routeTask(directive, "review this PR for auth bugs");
    expect(d.lane.name).toBe("review");
    expect(d.tier).toBe("review");
  });

  test("status → nano", () => {
    const d = routeTask(directive, "summarize git status");
    expect(d.lane.name).toBe("status");
    expect(d.tier).toBe("nano");
  });

  test("implement + walkaway → build", () => {
    const d = routeTask(directive, "implement the export feature", {
      walkaway: true,
    });
    expect(d.lane.name).toBe("build");
  });

  test("implement WITHOUT walkaway never lands in the worktree lane", () => {
    const d = routeTask(directive, "implement the export feature");
    expect(d.lane.name).toBe("quickfix");
    expect(d.lane.write).toBe("tree");
  });

  test("'walkaway' in the task text itself opts into the build lane", () => {
    const d = routeTask(directive, "implement the export feature, walkaway ok");
    expect(d.lane.name).toBe("build");
  });

  test("forced lane wins", () => {
    const d = routeTask(directive, "fix something", { lane: "review" });
    expect(d.lane.name).toBe("review");
    expect(d.reason).toContain("forced");
  });

  test("unknown falls back to default_lane", () => {
    const d = routeTask(directive, "please handle this carefully");
    expect(d.lane.name).toBe("quickfix");
    expect(d.confidence).toBe("low");
  });
});
