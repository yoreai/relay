import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { loadCatalog } from "./catalog.ts";
import { EMBEDDED_PRICES_YAML } from "./embedded_defaults.ts";
import { findPricesPath } from "./paths.ts";
import type { Usage } from "./backends/types.ts";

const PricesSchema = z.object({
  version: z.literal(1),
  models: z.record(
    z.string(),
    z.object({
      in: z.number(),
      out: z.number(),
      cache_read: z.number().optional(),
    }),
  ),
  bytes_per_token: z.number().positive().default(4),
});

export type Prices = z.infer<typeof PricesSchema>;

export type Receipt = {
  usedModel: string;
  baselineModel: string;
  tokensIn: number;
  tokensOut: number;
  tokensCacheRead: number;
  estimated: boolean;
  costUsedUsd: number;
  costBaselineUsd: number;
  savedUsd: number;
  line: string;
};

export function loadPrices(cwd: string = process.cwd()): Prices {
  const path = findPricesPath(cwd);
  const text =
    path && existsSync(path) ? readFileSync(path, "utf8") : EMBEDDED_PRICES_YAML;
  const parsed = PricesSchema.parse(parseYaml(text));

  // Catalog supplies prices for every known model; an explicit prices.yaml
  // entry always wins so users can pin their own numbers.
  const { catalog } = loadCatalog();
  const catalogModels: Prices["models"] = {};
  for (const [id, m] of Object.entries(catalog.models)) {
    catalogModels[id] = { in: m.in, out: m.out, cache_read: m.cache_read };
  }
  return { ...parsed, models: { ...catalogModels, ...parsed.models } };
}

export function priceTokens(
  prices: Prices,
  model: string,
  tokensIn: number,
  tokensOut: number,
  tokensCacheRead = 0,
): number | null {
  const p = prices.models[model];
  if (!p) return null;
  // Cache reads often dominate agentic runs; bill them at the listed
  // cache-read rate, or the industry-typical 10% of input price if unlisted.
  const cacheRate = p.cache_read ?? p.in * 0.1;
  return (
    (tokensIn / 1_000_000) * p.in +
    (tokensOut / 1_000_000) * p.out +
    (tokensCacheRead / 1_000_000) * cacheRate
  );
}

export function makeReceipt(opts: {
  prices: Prices;
  usedModel: string;
  baselineModel: string;
  usage?: Usage;
}): Receipt | null {
  const tokensIn = opts.usage?.tokensIn ?? 0;
  const tokensOut = opts.usage?.tokensOut ?? 0;
  const tokensCacheRead = opts.usage?.tokensCacheRead ?? 0;
  if (!tokensIn && !tokensOut) return null;

  const costUsed = priceTokens(
    opts.prices,
    opts.usedModel,
    tokensIn,
    tokensOut,
    tokensCacheRead,
  );
  const costBase = priceTokens(
    opts.prices,
    opts.baselineModel,
    tokensIn,
    tokensOut,
    tokensCacheRead,
  );
  if (costUsed == null || costBase == null) {
    return {
      usedModel: opts.usedModel,
      baselineModel: opts.baselineModel,
      tokensIn,
      tokensOut,
      tokensCacheRead,
      estimated: opts.usage?.estimated ?? true,
      costUsedUsd: 0,
      costBaselineUsd: 0,
      savedUsd: 0,
      line: `relay: savings unavailable (missing price for ${opts.usedModel} or ${opts.baselineModel})`,
    };
  }

  const saved = Math.max(0, costBase - costUsed);
  const tag = opts.usage?.estimated ? "estimated" : "measured";
  const fmt = (n: number) => (n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);
  const savedStr = saved < 0.01 ? "<$0.01" : `~$${saved.toFixed(2)}`;

  // Savings are a named counterfactual, not an absolute claim: "same work on
  // your baseline model would have cost X". The baseline is the quality bar
  // in router.yaml — if it's cheaper than what ran, say so instead of
  // pretending $0.00 saved.
  const line =
    costUsed >= costBase
      ? `relay: no savings — ${opts.usedModel} cost ${fmt(costUsed)}, your baseline ${opts.baselineModel} is not pricier (~${fmt(costBase)}) [${tag}]`
      : `relay: ${savedStr} saved — ${opts.usedModel} cost ${fmt(costUsed)}, baseline ${opts.baselineModel} would've cost ~${fmt(costBase)} [${tag}]`;

  return {
    usedModel: opts.usedModel,
    baselineModel: opts.baselineModel,
    tokensIn,
    tokensOut,
    tokensCacheRead,
    estimated: opts.usage?.estimated ?? true,
    costUsedUsd: costUsed,
    costBaselineUsd: costBase,
    savedUsd: saved,
    line,
  };
}
