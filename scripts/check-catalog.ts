#!/usr/bin/env bun
// Nightly CI guard: the catalog must stay valid, consistent with the default
// directive, and recently reviewed. A stale table silently overcharges users
// — so staleness FAILS the build and pings the maintainer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCatalog } from "../src/catalog.ts";
import { loadDirectiveFromText } from "../src/directive.ts";

const MAX_AGE_DAYS = 45;

const root = join(import.meta.dir, "..");
const errors: string[] = [];

const catalog = parseCatalog(
  readFileSync(join(root, "defaults", "catalog.yaml"), "utf8"),
);
const directive = loadDirectiveFromText(
  readFileSync(join(root, "defaults", "router.yaml"), "utf8"),
);

// 1. every default-directive candidate must exist in the catalog,
//    with a backend the catalog agrees can serve it
for (const [tierName, candidates] of Object.entries(directive.tiers)) {
  for (const c of candidates) {
    const m = catalog.models[c.model];
    if (!m) {
      errors.push(`tier ${tierName}: model "${c.model}" missing from catalog`);
      continue;
    }
    if (!m.backends.includes(c.backend)) {
      errors.push(
        `tier ${tierName}: catalog says "${c.model}" is not served by backend "${c.backend}"`,
      );
    }
  }
}

// 2. baseline must be priceable
if (!catalog.models[directive.baseline]) {
  errors.push(`baseline "${directive.baseline}" missing from catalog`);
}

// 3. freshness — the whole point is that this table is always looked at
const ageDays =
  (Date.now() - new Date(catalog.updated + "T00:00:00Z").getTime()) / 86_400_000;
if (ageDays > MAX_AGE_DAYS) {
  errors.push(
    `catalog last reviewed ${Math.floor(ageDays)} days ago (max ${MAX_AGE_DAYS}) — ` +
      `re-check model prices/classes and bump \`updated\``,
  );
}

if (errors.length) {
  console.error("catalog check FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `catalog ok: ${Object.keys(catalog.models).length} models, ` +
    `${catalog.classes.length} classes, reviewed ${Math.floor(ageDays)}d ago`,
);
