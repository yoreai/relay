import { describe, expect, test } from "bun:test";
import { loadPrices, makeReceipt } from "../src/savings.ts";

describe("savings", () => {
  test("receipt compares against baseline", () => {
    const prices = loadPrices(joinRoot());
    const r = makeReceipt({
      prices,
      usedModel: "grok-4.5",
      baselineModel: "fable-5-high",
      usage: { tokensIn: 100_000, tokensOut: 20_000, estimated: true },
    });
    expect(r).not.toBeNull();
    expect(r!.savedUsd).toBeGreaterThan(0);
    expect(r!.line).toContain("[estimated]");
    expect(r!.line).toContain("grok-4.5");
  });

  test("measured label when not estimated", () => {
    const prices = loadPrices(joinRoot());
    const r = makeReceipt({
      prices,
      usedModel: "glm-5.2",
      baselineModel: "fable-5-high",
      usage: { tokensIn: 10_000, tokensOut: 2_000, estimated: false },
    });
    expect(r!.line).toContain("[measured]");
  });
});

function joinRoot(): string {
  return `${import.meta.dir}/..`;
}
