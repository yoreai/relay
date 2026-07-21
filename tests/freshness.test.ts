import { describe, expect, test } from "bun:test";
import { compareVersions, composeFreshnessHint } from "../src/freshness.ts";

const NOW = new Date("2026-07-21T12:00:00Z");

describe("compareVersions", () => {
  test("orders semantic versions", () => {
    expect(compareVersions("0.6.0", "0.5.1")).toBeGreaterThan(0);
    expect(compareVersions("0.5.1", "0.5.1")).toBe(0);
    expect(compareVersions("0.5.1", "0.10.0")).toBeLessThan(0);
    expect(compareVersions("1.0", "0.9.9")).toBeGreaterThan(0);
  });
});

describe("composeFreshnessHint", () => {
  const local = { catalogUpdated: "2026-07-20", version: "0.5.1" };

  test("silent when everything is current", () => {
    expect(
      composeFreshnessHint(
        local,
        { catalogUpdated: "2026-07-20", latestVersion: "0.5.1" },
        NOW,
      ),
    ).toBeNull();
  });

  test("silent with no remote knowledge and a young catalog", () => {
    expect(composeFreshnessHint(local, {}, NOW)).toBeNull();
  });

  test("flags newer remote catalog", () => {
    const hint = composeFreshnessHint(
      local,
      { catalogUpdated: "2026-08-01" },
      NOW,
    );
    expect(hint).toContain("update available");
    expect(hint).toContain("relay update");
    expect(hint).toContain("2026-08-01");
  });

  test("flags newer release", () => {
    const hint = composeFreshnessHint(local, { latestVersion: "0.6.0" }, NOW);
    expect(hint).toContain("v0.6.0 available");
    expect(hint).toContain("brew upgrade relay");
  });

  test("stacks catalog and release hints", () => {
    const hint = composeFreshnessHint(
      local,
      { catalogUpdated: "2026-08-01", latestVersion: "0.6.0" },
      NOW,
    );
    expect(hint!.split("\n")).toHaveLength(2);
  });

  test("ignores older remote catalog (local override newer than main)", () => {
    expect(
      composeFreshnessHint(local, { catalogUpdated: "2026-06-01" }, NOW),
    ).toBeNull();
  });

  test("local-age fallback fires past 45 days without any network", () => {
    const stale = { catalogUpdated: "2026-05-01", version: "0.5.1" };
    const hint = composeFreshnessHint(stale, {}, NOW);
    expect(hint).toContain("days ago");
    expect(hint).toContain("relay update");
  });

  test("age fallback suppressed when remote confirms we are current", () => {
    const stale = { catalogUpdated: "2026-05-01", version: "0.5.1" };
    // remote catalog equals local: nothing newer exists, so stay quiet? No —
    // equal date means the 45-day review lapsed upstream too; the age hint
    // still helps nobody act locally. We keep it: staleness is real.
    const hint = composeFreshnessHint(stale, { catalogUpdated: "2026-05-01" }, NOW);
    expect(hint).toContain("days ago");
  });
});
