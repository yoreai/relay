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
    expect(r!.line).toContain("grok-4.5 cost ");
    expect(r!.line).toContain("baseline fable-5-high would've cost ");
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

  test("cache reads are priced into both sides", () => {
    const prices = loadPrices(joinRoot());
    const without = makeReceipt({
      prices,
      usedModel: "glm-5.2",
      baselineModel: "fable-5-high",
      usage: { tokensIn: 1_000, tokensOut: 1_000, estimated: false },
    });
    const withCache = makeReceipt({
      prices,
      usedModel: "glm-5.2",
      baselineModel: "fable-5-high",
      usage: {
        tokensIn: 1_000,
        tokensOut: 1_000,
        tokensCacheRead: 500_000,
        estimated: false,
      },
    });
    expect(withCache!.costUsedUsd).toBeGreaterThan(without!.costUsedUsd);
    // baseline scales too, so heavy cache reads still show savings
    expect(withCache!.savedUsd).toBeGreaterThan(without!.savedUsd);
  });

  test("cheaper baseline is reported honestly, not as $0.00 saved", () => {
    const prices = loadPrices(joinRoot());
    const r = makeReceipt({
      prices,
      usedModel: "fable-5-high",
      baselineModel: "haiku-4.5",
      usage: { tokensIn: 100_000, tokensOut: 20_000, estimated: false },
    });
    expect(r!.savedUsd).toBe(0);
    expect(r!.line).toContain("no savings");
  });
});

function joinRoot(): string {
  return `${import.meta.dir}/..`;
}
