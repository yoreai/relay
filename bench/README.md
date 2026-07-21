# relay bench — small, honest, reproducible

The claim on the homepage is "same quality on mechanical work, at a fraction
of the cost." This directory is the evidence, sized honestly.

## Method

- **Fixtures** (`tasks/`): tiny repos, each with one deliberate bug and a
  deterministic `node --test` suite (3–4 assertions). Quickfix-class work —
  the category relay routes cheap *by design*.
- **Two arms, identical prompts** (`scripts/bench.ts`):
  - `routed` — relay's normal routing (quickfix lane → work tier, with the
    usual verify → widen → escalate ladder available)
  - `frontier` — the same lane forced to the deep tier (frontier model)
- **Grading**: the repo's own tests. Objective pass/fail. No LLM judging.
- **Costs**: list prices from the catalog. The cursor backend does not emit
  token usage, so tokens are estimated from I/O bytes — the *same estimator
  in both arms*, so cost **ratios** are comparable even where absolute
  dollars are approximate. Receipts carry `measured`/`estimated` labels.

## What we do and don't claim

- ✅ On mechanical, verifiable tasks, routed cheap models pass the same
  tests as frontier models at a large cost reduction.
- ✅ Escalations (when the cheap model fails) are counted against the
  routed arm's cost — the ladder is part of the system under test.
- ❌ This is NOT a general model benchmark. N is small and disclosed.
- ❌ We do not claim cheap models match frontier on hard reasoning —
  relay routes those to frontier on purpose (that's the `review`/`deep` lane).

## Reproduce

```bash
bun install
bun run scripts/bench.ts                 # all tasks, both arms
bun run scripts/bench.ts --tasks=clamp   # one task
```

Raw results land in `bench/results/latest.json` (dated copies kept).
Requires an authenticated `cursor-agent` (or edit the directive to route
via the CLIs you have). Running the frontier arm costs real money — that's
rather the point.
