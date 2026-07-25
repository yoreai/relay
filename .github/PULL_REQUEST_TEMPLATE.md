<!-- Thanks for contributing to relay. Nothing here is bureaucracy: each box maps
     to a rule that has cost this project a bug at least once. -->

## What and why

<!-- What changes, and the reasoning behind it. The "why" matters more than the "what" —
     CHANGELOG.md doubles as this project's design record. -->

## Checklist

- [ ] `bun test` and `bun run typecheck` pass locally
- [ ] Added or updated a test for the changed behavior
- [ ] Added a `CHANGELOG.md` entry under `[Unreleased]` saying **why**, not just what
- [ ] No hardcoded model IDs or prices in code — those are catalog/directive data

### If you touched `defaults/catalog.yaml`

- [ ] Mirrored the change in `EMBEDDED_CATALOG_YAML` (`src/embedded_defaults.ts`)
- [ ] Bumped the `updated:` date in **both** copies
- [ ] `bun run scripts/check-catalog.ts` passes
- [ ] Quality classes stay honest — a class is a quality bar, and a vendor-only
      benchmark isn't a class promotion. When in doubt, place a model one class lower

### If you added or changed a backend adapter

- [ ] No permission-bypass flags (`--dangerously-*`, blanket auto-approve) — permission
      posture belongs to the user
- [ ] Model ids resolve to **pinned** names (`claude-opus-5`, never `opus`)
- [ ] Marked `verified: false` unless tested against a real installation

<!-- Security issue? Please don't open a PR first — see SECURITY.md for private reporting. -->
