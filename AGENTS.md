# Agent Instructions

Instructions for AI coding agents working on **relay**.

## Source-of-truth files

- **`README.md`** — what relay is, install/use, honest limits, roadmap
- **`CHANGELOG.md`** — released-version history *and* the reasoning behind each change
  (Keep a Changelog). Entries explain *why*, so this doubles as the design record
- **`defaults/router.yaml`** — starter directive: lanes → tiers → models (policy, shipped as data)
- **`defaults/catalog.yaml`** — the model facts table: price + quality class + serving backends.
  **The only price source.** A user's `prices.yaml` overrides it per model and `relay update`
  can't correct that, so relay never ships or writes one
- **This file** — architecture, invariants, and the maintenance playbook

There is intentionally **no `TODO.md`** and no separate design doc. Released history and
rationale → `CHANGELOG.md`. Architecture and hard-won rules → here. Anything unbuilt is a
GitHub issue, not a file, so it can be discussed and closed.

## After every code change

1. Update `CHANGELOG.md` under `[Unreleased]` — say *why*, not just what
2. Add/update tests for changed behavior
3. Run `bun test` and `bun run typecheck`
4. Keep employer/other-project references out of this repo — it's independent personal OSS

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
- **Backends:** `src/backends/` — common `Backend` interface. `cursor.ts` and `claude.ts` are
  hand-written; codex/gemini/grok/kimi are spec-driven entries in `cli.ts` (`CLI_SPECS`), so a
  new agent CLI is one table entry, not a new file. `fake.ts` backs the tests
- **Memory:** `src/memory.ts` (layered recall + notes, keyed by git root) and
  `src/transcripts.ts` (best-effort host session readers — must degrade to empty, never throw)
- **MCP:** `src/mcp.ts` — `relay_run`, `relay_status`, `relay_recall`, `relay_remember`,
  `relay_savings`, `relay_doctor`, `relay_login`, `relay_backends`
- **Activation:** `src/activation.ts` — host hint files that make `relay this: …` deterministic
- **Runtime:** Bun + TypeScript; ship via `bun build --compile`

## Design rules that shape the code

Change these only deliberately — each one is load-bearing.

- **Routing policy belongs to the user.** The directive maps *lanes → tiers* and one `tiers:`
  table maps tiers → models, as an ordered fallback list; the first candidate whose backend CLI
  is installed wins, so a single-backend machine routes everything with zero config. Tiers are
  also how relay avoids guessing which model is newest: users name a quality bar, not a version.
  `relay advise` proposes changes; a human accepts them. Relay never edits policy itself.
- **Git is the review surface.** Edits land in the caller's working tree as ordinary **unstaged**
  changes, indistinguishable from the host agent's own. Relay never stages or commits on the
  user's branch — auto-staging polluted their next commit. Walkaway lanes opt into `worktree`,
  which is the only path that may branch and commit.
- **Whoever understands the task pays for the brief.** MCP callers pass a curated brief and relay
  forwards it verbatim (a mid-session agent is the best available assembler); CLI users get
  relay's own assembler under a hard char budget. Thin briefs are safe because of
  verify → widen → escalate, not because of stuffed context.
- **Receipts never fabricate precision.** Price both sides, name the baseline, label measured vs
  estimated, and say "unavailable" rather than guess. Cache-read tokens are priced separately —
  ignoring them once overstated savings ~12x.
- **Auth is delegated; relay stores no credentials.** Never pass
  `--dangerously-skip-permissions` on the user's behalf — permission posture is theirs.
- **Backend CLI flags drift.** Feature-detect, fail with an actionable message, never crash core.
  Codex also needs `tool_timeout_sec` + tool-approval keys set at setup or it cancels MCP calls
  silently.
- **No telemetry, no phone-home.** Local `runs.jsonl` only, no task text unless `--log-tasks`.
  The only network calls are pull-only catalog/release checks.

## Invariants that cost us a bug once

- **Never map a catalog id to a floating model alias.** Backend id maps must resolve to pinned
  full names (`claude-opus-5`, not `opus`). A receipt prices a specific model, so the run has to
  BE that model — an alias silently re-points the day a new family member ships. Guarded by
  `tests/model_ids.test.ts`.
- **Never let a fetched catalog shadow a newer embedded one.** A release can ship a default
  directive routing to models only its embedded catalog knows; date-compare the two.
- **Never ship a second copy of the price table.** A `prices.yaml` entry overrides the catalog
  forever — `relay update` cannot reach it — so `EMBEDDED_PRICES_YAML` lists no models and
  `relay init` writes no prices file. Guarded by `tests/savings.test.ts`.
- **Read-only lanes must be read-only in the backend flags too**, not just in the prompt.
- **Workers must never re-delegate:** `RELAY_WORKER=1` plus a hard refuse in `src/mcp.ts`.
- **Host transcript readers must degrade to empty, never throw.** They parse undocumented
  formats; a format change must not break `relay recall`.

## Identity

Independent personal OSS under the **yoreai** GitHub identity, not affiliated with any employer.
Remote: `git@github-personal:yoreai/relay.git`.
