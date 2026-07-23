# relay eval report

Run: 2026-07-23T21:21:11.611Z · **14/14 passed**

| # | scenario | layer | result | time | detail |
|---|----------|-------|--------|------|--------|
| 1 | write-lane: typo fixed in tree (unstaged), receipt measured & sane | mcp | ✅ pass | 9s | relay: ~$0.08 saved — glm-5.2 cost $0.02, baseline fable-5-high would've cost ~$0.09 [measured] · out=154tok |
| 2 | read-only: review lane reports without touching files | mcp | ✅ pass | 15s | tree clean after review |
| 3 | no-op guard: nonexistent bug yields zero edits | mcp | ✅ pass | 8s | no invented edits |
| 4 | cwd guard: omitted cwd in non-repo dir is refused | mcp | ✅ pass | 0s | refused with actionable error |
| 5 | recursion guard: RELAY_WORKER server refuses relay_run | mcp | ✅ pass | 0s | hard refusal |
| 6 | brief coercion: string files/done_means accepted end-to-end | mcp | ✅ pass | 9s | string brief fields coerced, run succeeded |
| 7 | fire-and-poll: wait:false returns id fast; status reaches ok | mcp | ✅ pass | 10s | dispatch 14ms · 6 progress events · final ok |
| 8 | walkaway: build lane commits on relay/* branch, main untouched | mcp | ✅ pass | 19s | committed on relay/build-1vey5w, main clean |
| 9 | bad directive: broken router.yaml errors readably | mcp | ✅ pass | 0s | readable field-level error |
| 10 | tool surface: doctor (fresh), savings, backends respond | mcp | ✅ pass | 6s | all respond · live auth → cursor:authed claude:authed codex:authed |
| 11 | memory: remember in one session, recall in the next (git+notes layers) | mcp | ✅ pass | 0s | note survived a fresh server · git+notes layers present |
| 12 | host cursor-agent: 'relay this' delegates via MCP | host | ✅ pass | 25s | delegated (proof: run record with this scratch repo's cwd) · typo fixed (rule via project .cursor/rules — headless CLI skips global IDE rules) |
| 13 | host claude: 'relay this' delegates via MCP | host | ✅ pass | 20s | delegated · 2 run record(s) · typo fixed |
| 14 | host codex: 'relay this' delegates via MCP | host | ✅ pass | 32s | delegated (proof: run record with this scratch repo's cwd) · typo fixed |

MCP-layer scenarios drive `relay mcp serve` over stdio with the same protocol hosts use; host-layer scenarios run the real CLIs headless with a "relay this:" prompt and assert the delegation actually happened (run record + fixed file). Each scenario uses a fresh scratch repo and isolated XDG dirs — nothing touches the developer's real state.
