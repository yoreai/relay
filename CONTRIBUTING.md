# Contributing to relay

Thanks for helping keep agent work cheap and verified.

## Quick start

```bash
git clone https://github.com/yoreai/relay.git && cd relay
bun install
bun test && bun run typecheck     # both must pass before a PR
```

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

See [`AGENTS.md`](./AGENTS.md) for the full maintenance playbook (it's
written for AI agents, and it works for humans too).
