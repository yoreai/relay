import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  CLI_SPECS,
  discoverCliBinary,
  opencodeModelId,
} from "./backends/cli.ts";
import { runCli } from "./backends/spawn.ts";
import { relayDataDir } from "./paths.ts";

/**
 * Installed ≠ servable for multi-provider CLIs: an opencode with OpenAI +
 * Abacus credentials but no zen billing can be on PATH while most
 * zen-mapped fallbacks fail at runtime. This probe asks the CLI what it can
 * actually serve, caches the answer for 24h, and lets routing filter tier
 * candidates through it.
 *
 * FAIL-OPEN by design: any probe error returns null and routing behaves
 * exactly as before — the probe only ever removes candidates when it
 * succeeded and returned a definitive list. Cache reads degrade to empty,
 * never throw (same discipline as the host transcript readers).
 */

const SERVABLE_TTL_MS = 24 * 60 * 60 * 1000;

type ServableCache = Record<string, { binary: string; ts: number; models: string[] }>;

function cachePath(): string {
  return join(relayDataDir(), "servable.json");
}

function loadServableCache(): ServableCache {
  try {
    return JSON.parse(readFileSync(cachePath(), "utf8")) as ServableCache;
  } catch {
    return {};
  }
}

function saveServableCache(cache: ServableCache): void {
  mkdirSync(dirname(cachePath()), { recursive: true });
  writeFileSync(cachePath(), JSON.stringify(cache, null, 2), "utf8");
}

export function invalidateServableCache(backend?: string): void {
  const cache = loadServableCache();
  if (backend) delete cache[backend];
  saveServableCache(backend ? cache : {});
}

/** `opencode models` output: provider/model ids, one per line, amid ANSI decoration. */
function parseModelsList(stdout: string): string[] {
  const clean = stdout.replace(/\x1b\[[0-9;]*m/g, "");
  return clean
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[a-z0-9][a-z0-9.-]*\/\S+$/.test(l));
}

/**
 * The set of `provider/model` ids `backend` can serve, or null when there is
 * no probe for the backend, the binary is missing, or the probe failed with
 * no cache to fall back on. A fresh in-TTL cache hit wins unless opts.fresh;
 * on probe failure a stale cached entry is still better than none.
 */
export async function servableModels(
  backend: string,
  opts: { fresh?: boolean } = {},
): Promise<Set<string> | null> {
  if (backend !== "opencode") return null;
  const spec = CLI_SPECS[backend];
  const bin = spec ? discoverCliBinary(spec) : null;
  if (!bin) return null;

  const cache = loadServableCache();
  const hit = cache[backend];
  if (
    !opts.fresh &&
    hit &&
    hit.binary === bin &&
    Date.now() - hit.ts < SERVABLE_TTL_MS
  ) {
    return new Set(hit.models);
  }

  let models: string[] = [];
  try {
    const r = await runCli([bin, "models"], { timeoutMs: 20_000 });
    if (r.exitCode === 0) models = parseModelsList(r.stdout);
  } catch {
    // spawn-level failure — same as any other probe failure
  }
  if (models.length === 0) return hit ? new Set(hit.models) : null;

  cache[backend] = { binary: bin, ts: Date.now(), models };
  saveServableCache(cache);
  return new Set(models);
}

/**
 * Turn a probe result into a resolveTier filter. Null set → allow-all
 * (fail-open); non-opencode backends are never filtered. opencode candidates
 * are checked through opencodeModelId, so mapped ids match their
 * `opencode/<zen-id>` form while user-pinned passthrough ids
 * (`openai/gpt-5.6-sol`) are checked verbatim.
 */
export function servablePredicate(
  servable: Set<string> | null,
): (backend: string, model: string) => boolean {
  return (backend, model) => {
    if (!servable) return true;
    if (backend !== "opencode") return true;
    return servable.has(opencodeModelId(model));
  };
}
