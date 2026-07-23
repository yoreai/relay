# relay eval report

Run: 2026-07-23T19:14:51.722Z · **13/13 passed**

| # | scenario | layer | result | time | detail |
|---|----------|-------|--------|------|--------|
| 1 | write-lane: typo fixed in tree (unstaged), receipt measured & sane | mcp | ✅ pass | 10s | relay: ~$0.12 saved — glm-5.2 cost $0.03, baseline fable-5-high would've cost ~$0.14 [measured] · out=146tok |
| 2 | read-only: review lane reports without touching files | mcp | ✅ pass | 14s | tree clean after review |
| 3 | no-op guard: nonexistent bug yields zero edits | mcp | ✅ pass | 9s | no invented edits |
| 4 | cwd guard: omitted cwd in non-repo dir is refused | mcp | ✅ pass | 0s | refused with actionable error |
| 5 | recursion guard: RELAY_WORKER server refuses relay_run | mcp | ✅ pass | 0s | hard refusal |
| 6 | brief coercion: string files/done_means accepted end-to-end | mcp | ✅ pass | 9s | string brief fields coerced, run succeeded |
| 7 | fire-and-poll: wait:false returns id fast; status reaches ok | mcp | ✅ pass | 10s | dispatch 13ms · 6 progress events · final ok |
| 8 | walkaway: build lane commits on relay/* branch, main untouched | mcp | ✅ pass | 12s | committed on relay/build-ehkw2f, main clean |
| 9 | bad directive: broken router.yaml errors readably | mcp | ✅ pass | 0s | readable field-level error |
| 10 | tool surface: doctor (fresh), savings, backends respond | mcp | ✅ pass | 7s | all respond · live auth → cursor:authed claude:authed codex:authed |
| 11 | host cursor-agent: 'relay this' delegates via MCP | host | ✅ pass | 472s | delegated (proof: run record with this scratch repo's cwd) · typo fixed (rule via project .cursor/rules — headless CLI skips global IDE rules) (passed on retry — host model variance) |
| 12 | host claude: 'relay this' delegates via MCP | host | ✅ pass | 23s | delegated · 2 run record(s) · typo fixed |
| 13 | host codex: 'relay this' delegates via MCP | host | ✅ pass | 25s | delegated (proof: run record with this scratch repo's cwd) · typo fixed |

MCP-layer scenarios drive `relay mcp serve` over stdio with the same protocol hosts use; host-layer scenarios run the real CLIs headless with a "relay this:" prompt and assert the delegation actually happened (run record + fixed file). Each scenario uses a fresh scratch repo and isolated XDG dirs — nothing touches the developer's real state.
