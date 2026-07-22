# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.5] — 2026-07-22

### Fixed

- **Workers invented edits on no-op tasks**: asked to fix a typo that didn't
  exist, a worker made a cosmetic edit to look useful, verify rejected it,
  and relay escalated the doomed task to the frontier tier (negative
  savings). Every worker brief now states that an empty diff is a valid,
  successful outcome

## [0.6.4] — 2026-07-22

### Fixed

- **MCP `relay_run` ran in the wrong directory**: agent hosts launch the MCP
  server from arbitrary cwds (Cursor used the last workspace it happened to
  open), so delegated tasks read/edited a different repo than the session's.
  `relay_run` now takes a `cwd` argument (validated absolute path), the tool
  schema tells agents to always pass it, and the reply echoes the cwd used
- **Brief validation at the MCP boundary**: agents commonly pass bare strings
  for `files`/`constraints`/`done_means` — now coerced to single-item lists
  instead of erroring; `relay_run`'s schema also spells out the brief's
  field types

## [0.6.3] — 2026-07-21

### Fixed

- **Staging silently failed for the first changed file**: `git status
  --porcelain` output was trimmed before parsing, eating the leading space
  of ` M file` entries and corrupting the path (`math.js` → `ath.js`), so
  `git add` no-opped and edits landed unstaged (receipts also logged the
  mangled names). Now parsed via NUL-separated `--porcelain -z`, with
  rename entries handled

## [0.6.2] — 2026-07-21

### Changed

- **`relay setup` auto-registers MCP everywhere**: Cursor (`~/.cursor/mcp.json`),
  Claude Code (`claude mcp add`, JSON fallback), and Codex (`codex mcp add`,
  TOML fallback) — no manual `config.toml` editing

## [0.6.1] — 2026-07-21

### Added

- **Recursion guard**: backends spawn workers with `RELAY_WORKER=1`; every
  worker brief opens with a do-not-re-delegate line; `relay_run` (MCP) and
  `runTask` (CLI/REPL) hard-refuse inside a worker (`RELAY_ALLOW_NESTED=1`
  overrides) — fixes workers inheriting global "use relay" instructions and
  looping

### Changed

- Site + README copy aligned: no delegation-policy / skill setup — just
  `relay setup` then "relay this: …"; README status section updated
- Probe tests: longer timeout on auth-heavy cases (real CLIs can exceed 5s)

## [0.6.0] — 2026-07-21

### Added

- **Freshness reminders, pull-only**: doctor/status (CLI and MCP) now surface
  a one-line hint when the public catalog on main is newer than the local one
  or a newer release exists — backed by a quiet 24h-cached GET of two public
  GitHub files, so agents see "run `relay update`" where they already look;
  no telemetry, opt out with `RELAY_NO_UPDATE_CHECK=1`; offline machines get
  a network-free stale-catalog hint after 45 days

- Site + README: activate section — install, `relay setup`, and a copyable
  agent-independent prompt that adds a delegation policy to `AGENTS.md` /
  `CLAUDE.md` (no Cursor-only skill path)
- Site: trust section — local harness, no telemetry / no phone-home; catalog
  and binary freshness via pull-only `relay update`
- `bench/`: open micro-benchmark — six deterministic bug-fix fixtures run
  through routed vs forced-frontier arms with identical prompts, graded by
  each repo's own tests; results in `bench/results/` (2026-07-21: quality
  parity 6/6 = 6/6, median cost ratio 5.2×)
- Site: "proof" section with methodology, per-task results grid, and
  claim/non-claim caveats
- Site: backends/CLI support chart (Cursor, Claude Code, Codex verified;
  Gemini / Grok / Kimi experimental); bolder brand mark + favicon;
  three-line hero tagline "route the work. keep the quality. keep the money."
  with larger nav/hero marks
- Custom domain [relayagent.dev](https://relayagent.dev) (GitHub homepage +
  README link)
- Brand banner (`assets/banner.png`) on README + site OG card; larger hero
  mark; tagline restored to "route the work. keep the quality. keep the money."


## [0.5.1] — 2026-07-20

### Fixed

- Cursor backend maps catalog ids to cursor-agent's real model ids
  (`grok-4.5`+effort → `cursor-grok-4.5-medium`, `gpt-5.6-luna` →
  `gpt-5.6-luna-low`, …) — verified against the CLI's model list; both
  status and quickfix lanes now complete end-to-end on the cursor backend
- Auth probe no longer misreads the per-repo workspace-trust prompt as a
  login failure (real runs pass `--force`)
- Catalog ids corrected to what cursor actually serves: `kimi-k2.7-code`
  (was kimi-k3), `gemini-3.1-pro` (was gemini-3-pro); haiku is claude-only

## [0.5.0] — 2026-07-20

### Added

- **Probe layer**: distinguishes app-installed / CLI-installed / signed-in-for-
  headless per tool (they really are three different things); auth checks
  cached 24h in `~/.local/share/relay/probe.json`, presence always live
- **Guided `relay setup`**: plain-language tool status, *offers to run*
  sign-ins (browser pops) instead of printing commands; `--yes` / `--no-input`
- **`relay login <tool>`**: one command to run any backend's sign-in flow
- **MCP `relay_doctor` + `relay_login`**: agents can diagnose missing/
  unauthenticated tools and fix them for the user mid-conversation
- `relay doctor [--fresh]` leads with the plain-language tool picture

### Fixed

- All backend invocations get a hard timeout (default 10 min,
  `RELAY_BACKEND_TIMEOUT_MS` to override): a hung CLI now fails over to the
  next fallback backend instead of stalling the run — found because codex
  hangs silently on unknown model ids

## [0.4.2] — 2026-07-20

### Fixed (found by dogfooding relay on itself)

- Backend hard-failure (auth error, crash) now retries the same tier on the
  next fallback backend instead of pointlessly escalating models
- Claude backend maps catalog ids to the CLI's model aliases
  (sonnet-5 → sonnet), passes `--verbose` (required for stream-json), and
  uses `--permission-mode acceptEdits` for edit lanes — still never
  `--dangerously-skip-permissions`
- Only files touched by the run are attributed/staged — pre-existing
  uncommitted work is left alone
- `relay doctor` probes cursor headless auth with a real invocation
  (interactive login does not imply `-p` mode works)
- `fake` backend removed from availability unless `RELAY_ALLOW_FAKE` is set

## [0.4.1] — 2026-07-20

### Added

- Release workflow auto-bumps the homebrew-tap formula (deploy-key push;
  no more manual sha256 ritual)
- Catalog freshness CI auto-files a `catalog` issue on failure (deduped)
- AGENTS.md documents the catalog maintenance ritual (data ships from main
  via `relay update`; no release required)
- README badges, CONTRIBUTING.md, brew caveats pointing at `relay setup`

## [0.4.0] — 2026-07-20

### Added

- **Codex backend** (verified against codex-cli 0.139): `codex exec` with
  workspace-write sandbox — never passes approval-bypass flags
- **Experimental gemini / grok / kimi adapters** via a spec-driven generic
  CLI backend — adding a new agent CLI is now one table entry
- Catalog: `gemini-3-flash`, `gemini-3-pro`; codex/grok/kimi serving entries
  for existing models
- Default directive: codex + gemini fallback candidates on every tier, so
  codex-only or gemini-only machines route out of the box
- Catalog CI now fails if a catalog backend has no relay adapter

## [0.3.0] — 2026-07-19

### Added

- **Model catalog** (`defaults/catalog.yaml`): prices + quality class
  (`nano/cheap/workhorse/opus-class/frontier`) + serving backends per model;
  embedded in the binary, feeds receipts for models missing from prices.yaml
- **`relay update [--check]`** — fetches the latest catalog from the repo
  (facts only, never touches router.yaml) and reports newer binary releases
- **`relay advise [--apply]`** — proposes cheaper *same-quality-class* models
  available on installed backends (e.g. kimi-k3 over fable-5-high at ~91%
  less); `--apply` prepends them to tier fallbacks as a git-visible edit;
  cites local verify-success rates when ≥3 runs exist
- **`relay setup`** — one command to register relay as an MCP server in
  Cursor (`~/.cursor/mcp.json`) and Claude Code, with backups; prints Codex snippet
- **Catalog freshness CI** — nightly job fails when the catalog is
  inconsistent with the default directive or unreviewed for 45 days
- `relay savings --by-model` now shows verify success per model
- Latency guard: advise never swaps a fast-flagged model for a slower one
- MCP `relay_run` description teaches expensive agents when to delegate

## [0.2.0] — 2026-07-19

### Added

- Tiers accept an ordered fallback list of `{backend, model}` candidates; the
  first candidate whose backend CLI is installed wins, so claude-only (or any
  single-backend) machines route every tier without config changes
- Default directive ships claude fallbacks for all six tiers
- `relay doctor` prints per-tier resolution for this machine, marking fallbacks
- Dry-run output flags when a tier resolved via fallback
- Prices for `sonnet-5` and `haiku-4.5`

### Changed

- Escalating onto a tier with no installed backend now stops the run with an
  actionable message instead of crashing

## [0.1.1] — 2026-07-19

### Fixed

- Embed default `router.yaml` / `prices.yaml` in the compiled binary so `relay` works without loose data files

## [0.1.0] — 2026-07-19

### Added

- Initial release: Bun + TypeScript CLI compiled to a single binary
- Directive loader (`router.yaml`) with zod validation and starter defaults
- Rules-first task router (lanes: status, quickfix, build, review)
- Backends: `cursor-agent`, `claude -p`, plus `fake` for CI
- Context assembly (git status/diff, named files, AGENTS.md, optional `bd`)
- Verify → widen → escalate loop with auto-detected lint/test commands
- Git-native visibility: stage by default; worktree + draft PR for build lane
- Savings receipts via `prices.yaml` (measured vs estimated labels)
- Local run log at `~/.local/share/relay/runs.jsonl`
- MCP server: `relay_run`, `relay_status`, `relay_savings`
- `relay doctor`, `relay init`, `relay savings`, `relay status`, REPL (`-i`)
- Homebrew tap formula path + curl install script
- GitHub Actions: CI (test/typecheck) and tag-triggered multi-arch release

[Unreleased]: https://github.com/yoreai/relay/compare/v0.6.5...HEAD
[0.6.5]: https://github.com/yoreai/relay/compare/v0.6.4...v0.6.5
[0.6.4]: https://github.com/yoreai/relay/compare/v0.6.3...v0.6.4
[0.6.3]: https://github.com/yoreai/relay/compare/v0.6.2...v0.6.3
[0.6.2]: https://github.com/yoreai/relay/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/yoreai/relay/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/yoreai/relay/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/yoreai/relay/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/yoreai/relay/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/yoreai/relay/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/yoreai/relay/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/yoreai/relay/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/yoreai/relay/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/yoreai/relay/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/yoreai/relay/releases/tag/v0.1.1
[0.1.0]: https://github.com/yoreai/relay/releases/tag/v0.1.0
