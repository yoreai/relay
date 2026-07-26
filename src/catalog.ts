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
  /**
   * Rates for backends that resell this model at their own price rather than
   * the vendor's. A model has one identity but not always one rate card:
   * OpenCode's zen gateway serves claude-sonnet-5 at 2/10 where Anthropic
   * lists 3/15, and gemini-3-flash at 0.5/3 where Google lists 0.30/2.50.
   * Pricing every zen run off the vendor card put receipts off by up to ~40%
   * in both directions, which is the one thing a receipt may never do.
   *
   * Only list a backend that actually differs — an absent entry means "same
   * as the vendor rate above", so a normal model stays two lines long. This
   * lives in the catalog on purpose: it's still one price table that
   * `relay update` can correct, not a second copy shipped elsewhere.
   */
  backend_prices: z
    .record(
      z.string(),
      z.object({
        in: z.number().nonnegative(),
        out: z.number().nonnegative(),
        cache_read: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
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
    // A rate for a backend that can't serve the model would never be read —
    // silently dead data in the one table receipts depend on.
    for (const backend of Object.keys(m.backend_prices ?? {})) {
      if (!m.backends.includes(backend)) {
        throw new Error(
          `catalog: model "${id}" prices backend "${backend}", which is not in its backends list`,
        );
      }
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

  // A fetched catalog declares its own freshness, so a post-dated `updated`
  // would outrank every future embedded copy — one bad file on the branch we
  // pull from, and it wins forever, surviving upgrades. A catalog can't have
  // been reviewed tomorrow; treat that as tampering and keep the embedded one.
  if (fetched.catalog.updated > today()) return embedded;

  return fetched.catalog.updated >= embedded.catalog.updated
    ? fetched
    : embedded;
}

/** UTC yyyy-mm-dd, comparable against the catalog's `updated` string. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * One comparable per-1M-token number. Agent traffic is input-heavy,
 * so blend 3:1 input:output.
 */
export function blendedCost(m: { in: number; out: number }): number {
  return m.in * 0.75 + m.out * 0.25;
}

/**
 * `blendedCost` for a model as a given backend serves it. Advise compares
 * candidates across backends, so quoting a gateway-served pick at the vendor
 * card would promise a saving the user doesn't get — and in zen's case
 * overstate it, since two of its cheap models cost more than the vendor's.
 */
export function blendedCostVia(m: CatalogModel, backend?: string): number {
  return blendedCost((backend && m.backend_prices?.[backend]) || m);
}
