# relay

**The interface-independent task router for AI agents.**

Hand relay a task in plain English — from your terminal, or from any agent that speaks MCP
(Cursor, Claude Code, Codex). A shareable *directive* (`router.yaml`) picks the
cheapest-and-fastest capable backend + model, relay runs it headless in your repo, verifies
the result, escalates only when verification fails, and prints a receipt for what it saved you.

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
relay init                          # write ~/.config/relay/router.yaml
relay doctor                        # backends found? authed?
relay "fix the flaky retry test"   # route → run → verify → receipt
relay --dry-run "review auth.ts"    # see routing without running
relay -i                            # interactive REPL
relay savings --by-lane
```

### MCP (Cursor / Claude Code)

```bash
relay mcp serve
```

**Cursor** — add to `.cursor/mcp.json` (or global MCP config):

```json
{
  "mcpServers": {
    "relay": {
      "command": "relay",
      "args": ["mcp", "serve"]
    }
  }
}
```

**Claude Code** — add to MCP settings:

```json
{
  "mcpServers": {
    "relay": {
      "command": "relay",
      "args": ["mcp", "serve"]
    }
  }
}
```

Tools: `relay_run`, `relay_status`, `relay_savings`.

## How it works

1. **Directive** — versioned `router.yaml` maps lanes → capability tiers → concrete models.
   Each tier is an ordered fallback list: the first candidate whose backend CLI is
   installed wins, so a claude-only (or cursor-only) machine routes every tier with
   zero config. `relay doctor` shows exactly where each tier lands on your machine.
2. **Route** — rules-first (verbs, file hints, walkaway); default lane if unsure
3. **Run** — headless `cursor-agent` or `claude` in your working tree
4. **Verify → widen → escalate** — thin briefs that self-heal before spending frontier tokens
5. **Receipt** — honest savings vs your baseline (measured when the backend reports usage,
   estimated from bytes for Cursor until its CLI emits tokens)

Git is the review surface: edits land **staged** by default (or in a worktree → draft PR for
walkaway/build lanes). Relay never commits unless a lane says so.

## The directive

Repo `./router.yaml` or `.relay/router.yaml` overrides `~/.config/relay/router.yaml`.
People share directives, not tribal knowledge. See [`defaults/router.yaml`](./defaults/router.yaml)
and [`PLAN.md`](./PLAN.md) for the full schema.

## Status

**v0.2.0** — CLI + MCP + cursor/claude backends with per-tier fallback + verify/escalate + receipts + packaging.

Not v1 yet: Windows, npm SDK, Codex backend, Frankie adapter (planned as a separate plugin).

## License

Apache-2.0 © YoreAI / yoreai
