import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { EMBEDDED_CATALOG_YAML } from "./embedded_defaults.ts";
import { relayConfigDir, relayDataDir } from "./paths.ts";

const CatalogModelSchema = z.object({
  class: z.string().min(1),
  in: z.number().nonnegative(),
  out: z.number().nonnegative(),
  cache_read: z.number().nonnegative().optional(),
  /** latency-optimized model; advise won't swap a fast model for a slow one */
  fast: z.boolean().optional(),
  backends: z.array(z.string()).min(1),
});

export const CatalogSchema = z.object({
  version: z.literal(1),
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  classes: z.array(z.string()).min(1),
  models: z.record(z.string(), CatalogModelSchema),
});

export type Catalog = z.infer<typeof CatalogSchema>;
export type CatalogModel = z.infer<typeof CatalogModelSchema>;

export function parseCatalog(text: string): Catalog {
  const catalog = CatalogSchema.parse(parseYaml(text));
  for (const [id, m] of Object.entries(catalog.models)) {
    if (!catalog.classes.includes(m.class)) {
      throw new Error(`catalog: model "${id}" has unknown class "${m.class}"`);
    }
  }
  return catalog;
}

/** Where `relay update` stores the fetched catalog. */
export function fetchedCatalogPath(): string {
  return join(relayDataDir(), "catalog.yaml");
}

export type LoadedCatalog = { catalog: Catalog; source: string };

/** Resolution: user config override → fetched by `relay update` → embedded. */
export function loadCatalog(): LoadedCatalog {
  const candidates = [
    { path: join(relayConfigDir(), "catalog.yaml"), source: "user config" },
    { path: fetchedCatalogPath(), source: "fetched" },
  ];
  for (const c of candidates) {
    if (!existsSync(c.path)) continue;
    try {
      return {
        catalog: parseCatalog(readFileSync(c.path, "utf8")),
        source: c.source,
      };
    } catch {
      // corrupt override — fall through rather than break routing
    }
  }
  return { catalog: parseCatalog(EMBEDDED_CATALOG_YAML), source: "embedded" };
}

/**
 * One comparable per-1M-token number. Agent traffic is input-heavy,
 * so blend 3:1 input:output.
 */
export function blendedCost(m: { in: number; out: number }): number {
  return m.in * 0.75 + m.out * 0.25;
}
