# Contributing to relay

Thanks for helping keep agent work cheap and verified. Contributions are welcome from
anyone — you don't need to ask for access or be added to anything first.

## How to contribute

Standard fork-and-pull-request flow:

1. **Fork** the repo on GitHub and clone your fork
2. **Branch** off `main` (`git switch -c fix-flaky-probe`)
3. **Make the change**, with a test and a `CHANGELOG.md` entry under `[Unreleased]`
4. **Open a pull request** against `yoreai/relay`. CI runs `bun test`,
   `bun run typecheck`, and the catalog checker on every PR

Small PRs get reviewed fastest. If you're planning something large, open an issue first so
we can agree on the shape before you spend time on it. Every merged PR earns you a place in
the repo's contributor list; there's no CLA to sign — Apache-2.0 covers it.

Found a security problem? Please report it privately instead — see
[SECURITY.md](./SECURITY.md).

## Quick start

```bash
git clone https://github.com/yoreai/relay.git && cd relay   # or your fork
bun install
bun test && bun run typecheck     # both must pass before a PR
bun run relay -- doctor           # sanity-check your local backends
```

Relay is Bun + TypeScript and ships as a compiled binary. `bun run relay -- <args>` runs
your working copy without installing it, so you can try changes against a real repo.

## Good first contributions

- Anything labelled [`good first issue`](https://github.com/yoreai/relay/labels/good%20first%20issue)
- **Model catalog updates** — see below, easiest and highest-value
- **Verifying an experimental backend adapter** (`gemini`, `grok`, `kimi`) against a real
  installation. This genuinely needs people who have those CLIs installed

## The easiest, highest-value contribution: the model catalog

[`defaults/catalog.yaml`](./defaults/catalog.yaml) is relay's fact table —
models, prices, quality classes, serving backends. When a new model ships or
prices drop:

1. Edit `defaults/catalog.yaml` **and** mirror the change in
   `EMBEDDED_CATALOG_YAML` inside `src/embedded_defaults.ts`
2. Bump the `updated:` date in both copies
3. `bun run scripts/check-catalog.ts` must pass

Keep classes honest — a model's class is its quality bar, and `relay advise`
only swaps within a class. When in doubt, place a model one class lower.

## Adding a backend adapter

New agent CLIs are one entry in `CLI_SPECS` (`src/backends/cli.ts`): binary
names, headless arg shape, login hint. Rules:

- Never pass permission-bypass flags (`--dangerously-*`, auto-approve) — the
  user's own tool config owns that posture
- Mark the spec `verified: false` until tested against a real installation
- Add the models it serves to the catalog

## Ground rules

- Every behavior change gets a test and a `CHANGELOG.md` entry under
  `[Unreleased]`
- No hardcoded model IDs or prices in code — that's catalog/directive data
- Savings must stay honest: measured vs estimated, labeled per run
- Be kind — see the [Code of Conduct](./CODE_OF_CONDUCT.md)

See [`AGENTS.md`](./AGENTS.md) for the full maintenance playbook (it's
written for AI agents, and it works for humans too). It documents the design rules and the
invariants that have each cost this project a bug — worth a skim before a larger change.

## Using an AI agent to contribute

Entirely welcome — relay is built this way. Two asks: point it at `AGENTS.md`, and review
its output yourself before opening the PR. A PR you haven't read is a PR the maintainer has
to read twice.
