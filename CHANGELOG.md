# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/yoreai/relay/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/yoreai/relay/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/yoreai/relay/releases/tag/v0.1.1
[0.1.0]: https://github.com/yoreai/relay/releases/tag/v0.1.0
