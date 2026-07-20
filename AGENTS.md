# Agent Instructions

Instructions for AI coding agents working on **relay**.

## Source-of-truth files

- **`PLAN.md`** — product decisions, architecture, milestones (do not relitigate §2 without the owner)
- **`CHANGELOG.md`** — released-version history (Keep a Changelog)
- **`README.md`** — public install/use + roadmap
- **`defaults/router.yaml`** + **`defaults/prices.yaml`** — starter directive and price table (data, not code)

There is intentionally **no `TODO.md`**. Released history → `CHANGELOG.md`. Design → `PLAN.md`.

## After every code change

1. Update `CHANGELOG.md` under `[Unreleased]`
2. Add/update tests for changed behavior
3. Run `bun test` and `bun run typecheck`
4. Keep Abridge/Frankie references out of core — Frankie is an optional adapter (M6)

## Catalog maintenance (every few weeks — the "always looked at" table)

`defaults/catalog.yaml` is **data on main**: installed relays fetch it via
`relay update` directly from the repo — catalog changes need **no release**.

1. Review model prices/classes against provider price pages and coding-agent
   leaderboards; add new models, drop dead ones (keep classes honest — a
   model's class is its quality bar, advise swaps only within a class)
2. Mirror every change in `EMBEDDED_CATALOG_YAML` (`src/embedded_defaults.ts`)
3. Bump the `updated:` date in BOTH copies
4. `bun run scripts/check-catalog.ts` + `bun test`, then push to main

The nightly "Catalog freshness" workflow fails and auto-files a `catalog`
issue if the table is inconsistent, references a backend with no adapter,
or goes 45 days without review.

## Before a version release

1. Bump `version` in `package.json`
2. Move `[Unreleased]` entries in `CHANGELOG.md` to a new version section
3. Commit, tag `vX.Y.Z`, push tag (triggers binary release workflow)
4. Update `yoreai/homebrew-tap` formula URL + sha256

## Architecture quick reference

- **Entry:** `src/cli.ts` — human CLI + `relay mcp serve`
- **Core loop:** `src/run.ts` — route → assemble → backend → verify → widen/escalate → receipt
- **Directive:** `src/directive.ts` (zod) loads repo/`~/.config/relay`/bundled `router.yaml`
- **Backends:** `src/backends/{cursor,claude,fake}.ts` — common `Backend` interface
- **MCP:** `src/mcp.ts` — tools `relay_run`, `relay_status`, `relay_savings`
- **Runtime:** Bun + TypeScript; ship via `bun build --compile`

## Identity

Personal OSS under **yoreai** (not Abridge). Remote: `git@github-personal:yoreai/relay.git`.
