# relay eval report

Run: 2026-07-23T12:47:25.417Z · **12/13 passed** · 1 blocked on environment (not product failures)

| # | scenario | layer | result | time | detail |
|---|----------|-------|--------|------|--------|
| 1 | write-lane: typo fix lands staged, receipt measured & sane | mcp | ✅ pass | 18s | relay: ~$0.13 saved — sonnet-5 cost $0.05, baseline fable-5-high would've cost ~$0.18 [measured] · out=511tok |
| 2 | read-only: review lane reports without touching files | mcp | ✅ pass | 9s | tree clean after review |
| 3 | no-op guard: nonexistent bug yields zero edits | mcp | ✅ pass | 11s | no invented edits |
| 4 | cwd guard: omitted cwd in non-repo dir is refused | mcp | ✅ pass | 0s | refused with actionable error |
| 5 | recursion guard: RELAY_WORKER server refuses relay_run | mcp | ✅ pass | 0s | hard refusal |
| 6 | brief coercion: string files/done_means accepted end-to-end | mcp | ✅ pass | 13s | string brief fields coerced, run succeeded |
| 7 | fire-and-poll: wait:false returns id fast; status reaches ok | mcp | ✅ pass | 25s | dispatch 13ms · 11 progress events · final ok |
| 8 | walkaway: build lane commits on relay/* branch, main untouched | mcp | ✅ pass | 25s | committed on relay/build-kpcm8s, main clean |
| 9 | bad directive: broken router.yaml errors readably | mcp | ✅ pass | 0s | readable field-level error |
| 10 | tool surface: doctor (fresh), savings, backends respond | mcp | ✅ pass | 4s | all respond · live auth → cursor:false claude:authed codex:authed |
| 11 | host cursor-agent: 'relay this' delegates via MCP | host | ⚠️ blocked | 0s | BLOCKED (environment, not product): cursor-agent headless auth expired — run `cursor-agent login` and re-run |
| 12 | host claude: 'relay this' delegates via MCP | host | ✅ pass | 22s | delegated · 2 run record(s) · typo fixed |
| 13 | host codex: 'relay this' delegates via MCP | host | ✅ pass | 26s | delegated (proof: host transcript shows completed relay_run) · typo fixed |

MCP-layer scenarios drive `relay mcp serve` over stdio with the same protocol hosts use; host-layer scenarios run the real CLIs headless with a "relay this:" prompt and assert the delegation actually happened (run record + fixed file). Each scenario uses a fresh scratch repo and isolated XDG dirs — nothing touches the developer's real state.
