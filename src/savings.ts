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
): number | null {
  const p = prices.models[model];
  if (!p) return null;
  return (tokensIn / 1_000_000) * p.in + (tokensOut / 1_000_000) * p.out;
}

export function makeReceipt(opts: {
  prices: Prices;
  usedModel: string;
  baselineModel: string;
  usage?: Usage;
}): Receipt | null {
  const tokensIn = opts.usage?.tokensIn ?? 0;
  const tokensOut = opts.usage?.tokensOut ?? 0;
  if (!tokensIn && !tokensOut) return null;

  const costUsed = priceTokens(opts.prices, opts.usedModel, tokensIn, tokensOut);
  const costBase = priceTokens(
    opts.prices,
    opts.baselineModel,
    tokensIn,
    tokensOut,
  );
  if (costUsed == null || costBase == null) {
    return {
      usedModel: opts.usedModel,
      baselineModel: opts.baselineModel,
      tokensIn,
      tokensOut,
      estimated: opts.usage?.estimated ?? true,
      costUsedUsd: 0,
      costBaselineUsd: 0,
      savedUsd: 0,
      line: `relay: savings unavailable (missing price for ${opts.usedModel} or ${opts.baselineModel})`,
    };
  }

  const saved = Math.max(0, costBase - costUsed);
  const tag = opts.usage?.estimated ? "estimated" : "measured";
  const line = `relay: ~$${saved.toFixed(2)} saved (${opts.usedModel} vs ${opts.baselineModel}) [${tag}]`;

  return {
    usedModel: opts.usedModel,
    baselineModel: opts.baselineModel,
    tokensIn,
    tokensOut,
    estimated: opts.usage?.estimated ?? true,
    costUsedUsd: costUsed,
    costBaselineUsd: costBase,
    savedUsd: saved,
    line,
  };
}
