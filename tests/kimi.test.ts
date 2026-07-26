import { describe, expect, test } from "bun:test";
import { CLI_SPECS } from "../src/backends/cli.ts";
import { floatingHandleSuffix } from "../src/doctor.ts";

describe("kimi CLI spec", () => {
  const spec = CLI_SPECS.kimi!;

  test("buildArgs maps catalog ids to pinned managed aliases", () => {
    expect(spec.buildArgs("fix the test", "kimi-k3")).toEqual([
      "-p",
      "fix the test",
      "--model",
      "kimi-code/k3",
    ]);
    expect(spec.buildArgs("fix the test", "kimi-k2.7-code")).toContain(
      "kimi-code/kimi-for-coding",
    );
  });

  test("buildEnv passes the tier effort through as KIMI_MODEL_THINKING_EFFORT", () => {
    // kimi has no --effort flag; the env var forces thinking.effort on the
    // wire (k3: low/high/max; boolean-thinking models treat it as "on").
    expect(spec.buildEnv?.("max")).toEqual({
      KIMI_MODEL_THINKING_EFFORT: "max",
    });
    expect(spec.buildEnv?.("low")).toEqual({
      KIMI_MODEL_THINKING_EFFORT: "low",
    });
  });

  test("buildEnv stays empty without an effort so the model's default applies", () => {
    expect(spec.buildEnv?.(undefined)).toEqual({});
  });

  test("flags are verified against a real install", () => {
    // Verified 2026-07-25 against kimi-code 0.29.1 (`kimi --help`).
    expect(spec.verified).toBe(true);
  });
});

describe("re-pointing handles are visible where routing is shown", () => {
  test("a floating-handle route is marked in tier resolution", () => {
    const suffix = floatingHandleSuffix("kimi", "kimi-k2.7-code");
    expect(suffix).toContain("kimi-code/kimi-for-coding");
    expect(suffix).toContain("re-points");
  });

  test("pinned routes and other backends read exactly as before", () => {
    expect(floatingHandleSuffix("kimi", "kimi-k3")).toBe("");
    expect(floatingHandleSuffix("kimi", "kimi-k2.6")).toBe("");
    expect(floatingHandleSuffix("cursor", "composer-2.5")).toBe("");
    // a model name that only *looks* like kimi's must not be marked
    expect(floatingHandleSuffix("claude", "kimi-k2.7-code")).toBe("");
  });
});
