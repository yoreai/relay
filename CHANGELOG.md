# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Activation hints now tell host agents to start nontrivial relay tasks asynchronously and poll `relay_status`, giving users periodic phase/blocker updates instead of leaving one opaque tool call running for minutes

### Fixed

- `relay login <tool>` / `relay setup`'s sign-in prompt could go silent right when a browser challenge needed attention: cursor-agent's "if your browser didn't open, use this link: …" fallback only surfaced after the 3-minute timeout killed the process, by which point the link was already dead. The login command's stdout/stderr now stream live to stderr as they run, and login commands no longer get tagged `RELAY_WORKER=1` (that tag is for backend work relay dispatches, not for a login the user is driving directly)

## [0.6.15] — 2026-07-23

### Added

- End-to-end eval suite (`bun run evals`, `--hosts` for the host-delegation layer): drives `relay mcp serve` over stdio the way real hosts do across 10 preset scenarios (write lane, read-only, no-op, cwd/recursion guards, brief coercion, fire-and-poll, walkaway, bad directive, tool surface) plus live cursor-agent/claude/codex "relay this:" delegation checks; writes `evals/report.md`

### Fixed

- Codex could never actually call relay: codex gates MCP tool calls behind an approval elicitation that headless `codex exec` auto-cancels ("user cancelled MCP tool call") and interactive mode re-prompts for, and its 60s default tool timeout is shorter than a typical run — codex then quietly did the task itself, so delegation looked fine while relay never ran. `relay setup` now sets `tool_timeout_sec = 900` and `default_tools_approval_mode = "approve"` on the relay server block
- `relay setup --yes` no longer auto-launches interactive browser sign-in flows, which hung forever in scripts and agent-driven setups; it prints the sign-in command instead
- `relay login <tool>` (also `relay_login` and `relay setup`'s sign-in offers) no longer re-probes every installed tool's auth after a sign-in — it was invalidating and live-rechecking cursor, claude, *and* codex on every single-tool login, turning e.g. `relay login codex` into a multi-tool audit with extra model-calling latency. Now only the tool just signed into gets a fresh check; the others keep their cached verdict

### Changed

- README and site no longer claim "no per-agent config"; setup installs a removable delegation hint per host and says so
- Changelog consolidated: entries condensed to the essential user-facing change; anecdotes and site/branding noise removed (no versions, dates, or links altered)

## [0.6.14] — 2026-07-23

### Fixed

- Read-only cursor lanes no longer edit files: `--force` is no longer passed unconditionally for `write: none` lanes, which now get `--trust` only, and every backend prompt gains an explicit READ-ONLY guard
- MCP refuses to run when the host omits `cwd` instead of silently running from the MCP server's own working directory; it errors and asks the host to retry with `cwd`

## [0.6.13] — 2026-07-23

### Fixed

- Cursor savings were inflated ~10x: output tokens are now read from cursor-agent's result event instead of byte-estimated from the stream-json transcript; cursor and claude receipts are now `[measured]`

### Changed

- Cache-read tokens are now priced into both sides of the receipt, at the catalog `cache_read` rate or 10% of input price when unlisted
- Receipt wording makes the counterfactual explicit (`~$0.37 saved — glm-5.2 cost $0.05, baseline fable-5-high would've cost ~$0.42 [measured]`); says "no savings" instead of `$0.00 saved` when the baseline is cheaper

## [0.6.12] — 2026-07-23

### Added

- `relay setup` installs activation hints per host (Cursor rule, fenced blocks in `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`) so hosts delegate on "relay this: …"; `relay uninstall` strips exactly the fenced block. The hint carries the RELAY_WORKER guard

### Changed

- Catalog: GLM-5.2 promoted `cheap` → `workhorse`; starter directive routes the `work` tier to cursor/glm-5.2 first (~35% cheaper than grok-4.5 at the same quality bar), with grok-4.5 as first fallback

### Fixed

- `relay backends` now shows "disabled by you" for tools that aren't installed (the disable was applied but invisible)

## [0.6.11] — 2026-07-22

### Fixed

- Invalid `router.yaml` now fails with a readable field-by-field error plus a `relay init --force` hint, instead of a raw JSON validation dump
- Failed runs show the backend's actual error: the run summary gains a `why:` line and `backend_done` carries an excerpt of the backend's output

## [0.6.10] — 2026-07-22

### Fixed

- Verify can no longer hang a run: verify commands run with `CI=1` (flips vitest/jest/react-scripts out of watch mode) and a 10-minute kill timer that reports as a verify failure

## [0.6.9] — 2026-07-22

### Fixed

- Walkaway runs now commit on the relay/* branch instead of leaving edits merely staged; the CLI summary and MCP reply state the branch, worktree path, and explicit reconcile instructions (no auto-merge)

## [0.6.8] — 2026-07-22

### Added

- `relay uninstall [--purge]`: deregisters the MCP server from Cursor/Claude/Codex (CLI removal first, config-file edit with `.relay-bak` backups as fallback), optionally purges `~/.config/relay` + `~/.local/share/relay`, then points at `brew uninstall relay`

## [0.6.7] — 2026-07-22

### Added

- Backend opt-in: `relay setup` asks per detected tool, `relay backends [enable|disable <tool>]` changes it anytime, and agents get the `relay_backends` MCP tool. Stored in `~/.config/relay/settings.yaml` (separate from the shareable directive); disabled backends vanish from routing and are marked in doctor output

## [0.6.6] — 2026-07-22

### Added

- Pollable progress feed: runs log phase events to `~/.local/share/relay/events/<id>.jsonl`; `relay_status {id}` / `relay status <id>` return the feed plus current phase; MCP hosts passing a progressToken get live `notifications/progress` updates
- True fire-and-poll: `relay_run {wait:false}` returns the run id immediately while the run continues server-side

### Fixed

- Walkaway runs no longer leave `?? .relay/` noise in the main tree's `git status`; the scratch dir is added to `.git/info/exclude` (never touches the user's .gitignore)

### Changed

- Worktree lanes are strictly opt-in: lanes with `walkaway: true` are skipped unless the caller explicitly requests walkaway; a bare "implement X" routes to a staged-edit lane

## [0.6.5] — 2026-07-22

### Fixed

- Worker briefs now state an empty diff is a valid outcome, preventing invented edits on no-op tasks that previously escalated to the frontier tier for negative savings

## [0.6.4] — 2026-07-22

### Fixed

- `relay_run` now takes a `cwd` argument (validated absolute path) and echoes the cwd used, so delegated tasks run in the session's repo instead of the MCP server's launch directory
- Brief validation at the MCP boundary: bare strings for `files`/`constraints`/`done_means` are coerced to single-item lists instead of erroring

## [0.6.3] — 2026-07-21

### Fixed

- Staging no longer silently fails for the first changed file: `git status` is now parsed via NUL-separated `--porcelain -z` (with rename handling) instead of trimming the leading space of ` M` entries and corrupting the path

## [0.6.2] — 2026-07-21

### Changed

- `relay setup` auto-registers MCP in Cursor (`~/.cursor/mcp.json`), Claude Code (`claude mcp add`, JSON fallback), and Codex (`codex mcp add`, TOML fallback) — no manual config editing

## [0.6.1] — 2026-07-21

### Added

- Recursion guard: backends spawn workers with `RELAY_WORKER=1`; worker briefs open with a do-not-re-delegate line; `relay_run` (MCP) and `runTask` (CLI/REPL) hard-refuse inside a worker (`RELAY_ALLOW_NESTED=1` overrides)

### Changed

- Probe tests: longer timeout on auth-heavy cases (real CLIs can exceed 5s)

## [0.6.0] — 2026-07-21

### Added

- Freshness reminders, pull-only: doctor/status surface a one-line hint when the public catalog on main is newer than local or a newer release exists; backed by a quiet 24h-cached GET of two public GitHub files; opt out with `RELAY_NO_UPDATE_CHECK=1`; offline machines get a network-free stale-catalog hint after 45 days
- `bench/`: open micro-benchmark — six deterministic bug-fix fixtures run through routed vs forced-frontier arms with identical prompts, graded by each repo's own tests; results in `bench/results/` (2026-07-21: quality parity 6/6 = 6/6, median cost ratio 5.2×)

## [0.5.1] — 2026-07-20

### Fixed

- Cursor backend maps catalog ids to cursor-agent's real model ids (`grok-4.5`+effort → `cursor-grok-4.5-medium`, `gpt-5.6-luna` → `gpt-5.6-luna-low`, …); status and quickfix lanes now complete end-to-end on the cursor backend
- Auth probe no longer misreads the per-repo workspace-trust prompt as a login failure
- Catalog ids corrected to what cursor actually serves: `kimi-k2.7-code` (was kimi-k3), `gemini-3.1-pro` (was gemini-3-pro); haiku is claude-only

## [0.5.0] — 2026-07-20

### Added

- Probe layer: distinguishes app-installed / CLI-installed / signed-in-for-headless per tool; auth checks cached 24h in `~/.local/share/relay/probe.json`, presence always live
- Guided `relay setup`: plain-language tool status, offers to run sign-ins (browser pops) instead of printing commands; `--yes` / `--no-input`
- `relay login <tool>`: one command to run any backend's sign-in flow
- MCP `relay_doctor` + `relay_login`: agents can diagnose and fix missing/unauthenticated tools mid-conversation
- `relay doctor [--fresh]` leads with the plain-language tool picture

### Fixed

- All backend invocations get a hard timeout (default 10 min, `RELAY_BACKEND_TIMEOUT_MS` to override); a hung CLI fails over to the next fallback backend instead of stalling the run

## [0.4.2] — 2026-07-20

### Fixed

- Backend hard-failure (auth error, crash) now retries the same tier on the next fallback backend instead of escalating models
- Claude backend maps catalog ids to the CLI's model aliases (sonnet-5 → sonnet), passes `--verbose` (required for stream-json), and uses `--permission-mode acceptEdits` for edit lanes — still never `--dangerously-skip-permissions`
- Only files touched by the run are attributed/staged; pre-existing uncommitted work is left alone
- `relay doctor` probes cursor headless auth with a real invocation
- `fake` backend removed from availability unless `RELAY_ALLOW_FAKE` is set

## [0.4.1] — 2026-07-20

### Added

- Release workflow auto-bumps the homebrew-tap formula (deploy-key push; no manual sha256 ritual)
- Catalog freshness CI auto-files a `catalog` issue on failure (deduped)
- AGENTS.md documents the catalog maintenance ritual (data ships from main via `relay update`; no release required)

## [0.4.0] — 2026-07-20

### Added

- Codex backend (verified against codex-cli 0.139): `codex exec` with workspace-write sandbox — never passes approval-bypass flags
- Experimental gemini / grok / kimi adapters via a spec-driven generic CLI backend; adding a new agent CLI is now one table entry
- Catalog: `gemini-3-flash`, `gemini-3-pro`; codex/grok/kimi serving entries for existing models
- Default directive: codex + gemini fallback candidates on every tier, so codex-only or gemini-only machines route out of the box
- Catalog CI now fails if a catalog backend has no relay adapter

## [0.3.0] — 2026-07-19

### Added

- Model catalog (`defaults/catalog.yaml`): prices + quality class (`nano/cheap/workhorse/opus-class/frontier`) + serving backends per model; embedded in the binary, feeds receipts for models missing from prices.yaml
- `relay update [--check]` — fetches the latest catalog from the repo (facts only, never touches router.yaml) and reports newer binary releases
- `relay advise [--apply]` — proposes cheaper same-quality-class models available on installed backends; `--apply` prepends them to tier fallbacks as a git-visible edit; cites local verify-success rates when ≥3 runs exist
- `relay setup` — one command to register relay as an MCP server in Cursor and Claude Code, with backups; prints Codex snippet
- Catalog freshness CI — nightly job fails when the catalog is inconsistent with the default directive or unreviewed for 45 days
- `relay savings --by-model` now shows verify success per model
- Latency guard: advise never swaps a fast-flagged model for a slower one
- MCP `relay_run` description teaches expensive agents when to delegate

## [0.2.0] — 2026-07-19

### Added

- Tiers accept an ordered fallback list of `{backend, model}` candidates; the first candidate whose backend CLI is installed wins, so single-backend machines route every tier without config changes
- Default directive ships claude fallbacks for all six tiers
- `relay doctor` prints per-tier resolution for this machine, marking fallbacks
- Dry-run output flags when a tier resolved via fallback
- Prices for `sonnet-5` and `haiku-4.5`

### Changed

- Escalating onto a tier with no installed backend now stops the run with an actionable message instead of crashing

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

[Unreleased]: https://github.com/yoreai/relay/compare/v0.6.15...HEAD
[0.6.15]: https://github.com/yoreai/relay/compare/v0.6.14...v0.6.15
[0.6.14]: https://github.com/yoreai/relay/compare/v0.6.13...v0.6.14
[0.6.13]: https://github.com/yoreai/relay/compare/v0.6.12...v0.6.13
[0.6.12]: https://github.com/yoreai/relay/compare/v0.6.11...v0.6.12
[0.6.11]: https://github.com/yoreai/relay/compare/v0.6.10...v0.6.11
[0.6.10]: https://github.com/yoreai/relay/compare/v0.6.9...v0.6.10
[0.6.9]: https://github.com/yoreai/relay/compare/v0.6.8...v0.6.9
[0.6.8]: https://github.com/yoreai/relay/compare/v0.6.7...v0.6.8
[0.6.7]: https://github.com/yoreai/relay/compare/v0.6.6...v0.6.7
[0.6.6]: https://github.com/yoreai/relay/compare/v0.6.5...v0.6.6
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
