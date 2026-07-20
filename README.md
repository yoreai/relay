# relay

**The interface-independent task router for AI agents.** Hand relay a task in plain English —
from your terminal, or from any agent that speaks MCP (Cursor, Claude Code, Codex). A shareable
*directive* (`router.yaml`) decides the cheapest-and-fastest capable backend + model, relay runs
it headless in your repo, verifies the result, escalates only when verification fails, and prints
a receipt for what it saved you.

```
relay "fix the flaky retry test in src/api"
# → lane: quickfix · grok-4.5 · verify: lint+test ✓ · changes staged
# → relay: ~$1.84 saved (grok-4.5 vs fable-5-high) [estimated]
```

Status: **design complete, build starting** — see [PLAN.md](./PLAN.md) for the full architecture
and the agent handover. Nothing below this line works yet.

- One directive, any front-end: CLI + MCP server over the same core
- Backends: `cursor-agent`, `claude` headless (Frankie/others as adapters)
- Git-native visibility: changes land staged (or in a worktree → branch, per lane)
- verify → widen context → escalate model: thin briefs that self-heal
- Honest savings receipts (measured where the backend reports usage, estimated where it doesn't)

Planned install: `brew install yoreai/tap/relay` · Apache-2.0
