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

  // Task text is written by whoever briefed relay — over MCP that's another
  // agent — so prose must not be able to reach a lane that pushes a branch
  // with the user's credentials.
  test("'walkaway' in the task text does NOT opt into the build lane", () => {
    const d = routeTask(directive, "implement the export feature, walkaway ok");
    expect(d.lane.name).not.toBe("build");
    expect(d.lane.write).not.toBe("worktree");
  });

  test("a walkaway default_lane still won't auto-push without the opt-in", () => {
    const d = routeTask(
      { ...directive, default_lane: "build" },
      "please handle this carefully",
    );
    expect(d.lane.name).toBe("build");
    expect(d.lane.write).toBe("tree");
    expect(d.reason).toContain("walkaway not requested");
  });

  test("a walkaway default_lane is honored in full when asked for", () => {
    const d = routeTask(
      { ...directive, default_lane: "build" },
      "please handle this carefully",
      { walkaway: true },
    );
    expect(d.lane.name).toBe("build");
    expect(d.lane.write).toBe("worktree");
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
