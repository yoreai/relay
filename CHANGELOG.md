# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/yoreai/relay/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/yoreai/relay/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/yoreai/relay/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/yoreai/relay/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/yoreai/relay/releases/tag/v0.1.1
[0.1.0]: https://github.com/yoreai/relay/releases/tag/v0.1.0
