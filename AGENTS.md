# Agent Instructions

Instructions for AI coding agents working on **relay**.

## Source-of-truth files

- **`PLAN.md`** — locked design record: product decisions, architecture intent, open questions (do not relitigate §2 without the owner)
- **`CHANGELOG.md`** — released-version history (Keep a Changelog)
- **`README.md`** — public install/use + roadmap
- **`defaults/router.yaml`** — starter directive: lanes → tiers → models (policy, shipped as data)
- **`defaults/catalog.yaml`** — the model facts table: price + quality class + serving backends
  (`defaults/prices.yaml` is the legacy per-tier override users may still keep locally)

- **`docs/design/*.md`** — long-form *explorations* of directions we may or may not take.
  Never authoritative: if one conflicts with `PLAN.md`, `PLAN.md` wins. Each must state up
  front what has since shipped and what was deferred, so a reader can't mistake it for a plan.

There is intentionally **no `TODO.md`**. Released history → `CHANGELOG.md`. Locked design →
`PLAN.md`. Speculative design → `docs/design/`.

## After every code change

1. Update `CHANGELOG.md` under `[Unreleased]`
2. Add/update tests for changed behavior
3. Run `bun test` and `bun run typecheck`
4. Keep Abridge/Frankie references out of core — Frankie is an optional adapter (see `PLAN.md` §6)

## Catalog maintenance (every few weeks — the "always looked at" table)

`defaults/catalog.yaml` is **data on main**: installed relays fetch it via
`relay update` directly from the repo — catalog changes need **no release**.

1. Review model prices/classes against provider price pages and coding-agent
   leaderboards; add new models, drop dead ones (keep classes honest — a
   model's class is its quality bar, advise swaps only within a class). Prefer
   independently-verified benchmarks; vendor-only numbers are not a class promotion
2. Check what the CLIs actually serve — `cursor-agent models`, `claude --help` — and
   add a pinned id map entry for anything you route to
3. If the new model replaces an existing one at the same-or-lower price, give it
   `supersedes: [old-id]`. That is the ONLY way `advise` can tell existing users about a
   strictly-better model that saves them nothing (the cheaper-model rule stays silent)
4. Mirror every change in `EMBEDDED_CATALOG_YAML` (`src/embedded_defaults.ts`)
5. Bump the `updated:` date in BOTH copies
6. `bun run scripts/check-catalog.ts` + `bun test`, then push to main

The nightly "Catalog freshness" workflow fails and auto-files a `catalog`
issue if the table is inconsistent, references a backend with no adapter,
or goes 45 days without review.

## Before a version release

1. Bump `version` in `package.json` and `RELAY_VERSION` in `src/version.ts`
2. Move `[Unreleased]` entries in `CHANGELOG.md` to a new version section
3. Commit, tag `vX.Y.Z`, push tag (triggers binary release workflow)
4. The release workflow auto-bumps `yoreai/homebrew-tap` (deploy key in
   `TAP_DEPLOY_KEY` secret) — verify with `brew update && brew upgrade relay`

## Architecture quick reference

- **Entry:** `src/cli.ts` — human CLI + `relay mcp serve`
- **Core loop:** `src/run.ts` — route → assemble → backend → verify → widen/escalate → receipt
- **Directive:** `src/directive.ts` (zod) loads repo/`~/.config/relay`/bundled `router.yaml`
- **Catalog:** `src/catalog.ts` — model facts; resolution is user config → newer of (fetched, embedded)
- **Backends:** `src/backends/{cursor,claude,codex,fake}.ts` — common `Backend` interface
- **Memory:** `src/memory.ts` (layered recall + notes, keyed by git root) and
  `src/transcripts.ts` (best-effort host session readers — must degrade to empty, never throw)
- **MCP:** `src/mcp.ts` — `relay_run`, `relay_status`, `relay_recall`, `relay_remember`,
  `relay_savings`, `relay_doctor`, `relay_login`, `relay_backends`
- **Activation:** `src/activation.ts` — host hint files that make `relay this: …` deterministic
- **Runtime:** Bun + TypeScript; ship via `bun build --compile`

## Invariants that cost us a bug once

- **Never map a catalog id to a floating model alias.** Backend id maps must resolve to pinned
  full names (`claude-opus-5`, not `opus`). A receipt prices a specific model, so the run has to
  BE that model — an alias silently re-points the day a new family member ships. Guarded by
  `tests/model_ids.test.ts`.
- **Never let a fetched catalog shadow a newer embedded one.** A release can ship a default
  directive routing to models only its embedded catalog knows; date-compare the two.
- **Read-only lanes must be read-only in the backend flags too**, not just in the prompt.
- **Workers must never re-delegate:** `RELAY_WORKER=1` plus a hard refuse in `src/mcp.ts`.

## Identity

Personal OSS under **yoreai** (not Abridge). Remote: `git@github-personal:yoreai/relay.git`.
