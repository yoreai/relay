# relay

<p align="center">
  <img src="assets/banner.png" alt="relay — route the work. keep the quality. keep the money." width="720" />
</p>

<p align="center">
  <a href="https://relayagent.dev"><img src="https://img.shields.io/badge/site-relayagent.dev-4ade80?style=flat-square" alt="site" /></a>
  <a href="https://github.com/yoreai/relay/actions/workflows/ci.yml"><img src="https://github.com/yoreai/relay/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/yoreai/relay/releases/latest"><img src="https://img.shields.io/github/v/release/yoreai/relay?color=0e8a16" alt="Release" /></a>
  <a href="https://github.com/yoreai/homebrew-tap"><img src="https://img.shields.io/badge/brew-yoreai%2Ftap%2Frelay-fbb040" alt="Homebrew" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License" /></a>
</p>

**The interface-independent task router for AI agents.**

Site: [relayagent.dev](https://relayagent.dev)

Hand relay a task in plain English — from your terminal, or from any agent that speaks MCP
(Cursor, Claude Code, Codex). A shareable *directive* (`router.yaml`) picks the
cheapest-and-fastest capable backend + model, relay runs it headless in your repo, verifies
the result, escalates only when verification fails, and prints a receipt for what it saved you.

**Local harness.** No relay cloud, no accounts, no telemetry, no stored credentials.
`relay update` only *pulls* the public model catalog (and a release tag check) from
GitHub — it never uploads your tasks, code, or usage.

```
relay "fix the flaky retry test in src/api"
# → lane: quickfix · grok-4.5 · verify: lint+test ✓ · changes staged
# → relay: ~$1.84 saved (grok-4.5 vs fable-5-high) [estimated]
```

## 60-second install

```bash
# Homebrew (recommended)
brew install yoreai/tap/relay

# or curl
curl -fsSL https://raw.githubusercontent.com/yoreai/relay/main/scripts/install.sh | bash
```

From source (Bun required):

```bash
git clone git@github.com:yoreai/relay.git && cd relay
bun install
bun run src/cli.ts doctor
```

## Quick use

```bash
relay setup                         # probe your tools, guide sign-ins, register MCP
relay login cursor                  # run a tool's sign-in flow (pops your browser)
relay init                          # write ~/.config/relay/router.yaml
relay doctor                        # backends found? tier resolution on this machine?
relay "fix the flaky retry test"   # route → run → verify → receipt
relay --dry-run "review auth.ts"    # see routing without running
relay -i                            # interactive REPL
relay savings --by-lane
relay update                        # refresh the model catalog (facts, not policy)
relay advise                        # cheaper same-class models for your tiers
relay advise --apply                # accept the suggestions into router.yaml
```

## Activate

`relay setup` registers the MCP tools. From then on, just mention relay:

```
"relay this: fix the flaky retry test"
"use relay to bump the deps and clean up lint"
```

No skills, no policy files, no per-agent config. Relay has a built-in
recursion guard: delegated workers cannot re-delegate to relay.

### MCP tools

`relay_run`, `relay_status`, `relay_savings`, `relay_doctor`, `relay_login`.

`relay setup` wires Cursor + Claude Code. Codex: add to `~/.codex/config.toml`:

```toml
[mcp_servers.relay]
command = "relay"
args = ["mcp", "serve"]
```

## How it works

1. **Directive** — versioned `router.yaml` maps lanes → capability tiers → concrete models.
   Each tier is an ordered fallback list: the first candidate whose backend CLI is
   installed wins, so a claude-only (or cursor-only) machine routes every tier with
   zero config. `relay doctor` shows exactly where each tier lands on your machine.
2. **Route** — rules-first (verbs, file hints, walkaway); default lane if unsure
3. **Run** — headless `cursor-agent`, `claude`, or `codex` in your working tree
   (experimental adapters: `gemini`, `grok`, `kimi`)
4. **Verify → widen → escalate** — thin briefs that self-heal before spending frontier tokens
5. **Receipt** — honest savings vs your baseline (measured when the backend reports usage,
   estimated from bytes for Cursor until its CLI emits tokens)

Git is the review surface: edits land **staged** by default (or in a worktree → draft PR for
walkaway/build lanes). Relay never commits unless a lane says so.

## The directive

Repo `./router.yaml` or `.relay/router.yaml` overrides `~/.config/relay/router.yaml`.
People share directives, not tribal knowledge. See [`defaults/router.yaml`](./defaults/router.yaml)
and [`PLAN.md`](./PLAN.md) for the full schema.

## Staying current (facts vs policy)

The model market moves; a routing table nobody looks at silently overpays. Relay splits this:

- **Facts** — [`defaults/catalog.yaml`](./defaults/catalog.yaml): which models exist, prices,
  and a *quality class* per model (`nano → cheap → workhorse → opus-class → frontier`).
  `relay update` fetches the latest catalog; a scheduled CI job keeps the repo copy honest
  (it fails red when the catalog goes 45 days without review).
- **Policy** — your `router.yaml`. Relay **never** rewrites it behind your back.
  `relay advise` diffs your tiers against the catalog and proposes swaps *within the same
  quality class* (e.g. a frontier-class model at a tenth the price), citing your own local
  verify-success rates as evidence. `relay advise --apply` accepts — as a visible,
  git-diffable edit.

## Roadmap

- Verify gemini/grok/kimi adapter flags against real installs (codex is verified)
- Success-rate-aware advise (already logs verify results per model)
- Frankie adapter as a separate plugin package
- Windows, npm SDK

## Status

**v0.6.1** — recursion guard, pull-only freshness hints, relayagent.dev site,
open bench (6/6 quality parity, ~5.2× median savings). Not v1 yet: Windows,
npm SDK, verified gemini/grok/kimi adapters.

## License

Apache-2.0 © YoreAI / yoreai
