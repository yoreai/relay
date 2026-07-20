import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadDirectiveFromText } from "../src/directive.ts";
import { nextEscalation } from "../src/escalate.ts";

const directive = loadDirectiveFromText(
  readFileSync(join(import.meta.dir, "..", "defaults", "router.yaml"), "utf8"),
);

describe("escalate", () => {
  test("first failure widens", () => {
    const a = nextEscalation(directive, {
      attempts: 0,
      widened: false,
      tier: "work",
      bumps: 0,
    });
    expect(a.kind).toBe("retry");
    if (a.kind === "retry") {
      expect(a.widen).toBe(true);
      expect(a.tier).toBe("work");
    }
  });

  test("later failure bumps tier", () => {
    const a = nextEscalation(directive, {
      attempts: 1,
      widened: true,
      tier: "work",
      bumps: 0,
    });
    expect(a.kind).toBe("retry");
    if (a.kind === "retry") {
      expect(a.tier).not.toBe("work");
    }
  });

  test("stops after max bumps", () => {
    const a = nextEscalation(directive, {
      attempts: 2,
      widened: true,
      tier: "deep",
      bumps: 1,
    });
    expect(a.kind).toBe("stop");
  });
});
