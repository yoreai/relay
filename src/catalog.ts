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
  /**
   * Catalog ids this model replaces outright — strictly better at no higher
   * price (typically a new release on its predecessor's rate card). This is
   * how a new model reaches people who already have a directive: `advise`
   * flags superseded picks even when the successor saves nothing, which the
   * cheaper-model rule alone can never do.
   */
  supersedes: z.array(z.string()).optional(),
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

function tryLoad(path: string, source: string): LoadedCatalog | null {
  if (!existsSync(path)) return null;
  try {
    return { catalog: parseCatalog(readFileSync(path, "utf8")), source };
  } catch {
    return null; // corrupt override — fall through rather than break routing
  }
}

/**
 * Resolution: user config override → newer of (fetched, embedded).
 *
 * A hand-written config always wins — it's deliberate. Between the other two
 * we take whichever was reviewed most recently: upgrading the binary ships a
 * fresh embedded catalog AND a default directive that may route to models only
 * that catalog knows, so letting an older `relay update` download shadow it
 * would silently strip prices (and therefore receipts) from those models.
 */
export function loadCatalog(): LoadedCatalog {
  const user = tryLoad(join(relayConfigDir(), "catalog.yaml"), "user config");
  if (user) return user;

  const embedded: LoadedCatalog = {
    catalog: parseCatalog(EMBEDDED_CATALOG_YAML),
    source: "embedded",
  };
  const fetched = tryLoad(fetchedCatalogPath(), "fetched");
  if (!fetched) return embedded;

  return fetched.catalog.updated >= embedded.catalog.updated
    ? fetched
    : embedded;
}

/**
 * One comparable per-1M-token number. Agent traffic is input-heavy,
 * so blend 3:1 input:output.
 */
export function blendedCost(m: { in: number; out: number }): number {
  return m.in * 0.75 + m.out * 0.25;
}
