# relay eval report

Run: 2026-07-25T07:14:33.946Z · **18/18 passed**

| # | scenario | layer | result | time | detail |
|---|----------|-------|--------|------|--------|
| 1 | write-lane: typo fixed in tree (unstaged), receipt measured & sane | mcp | ✅ pass | 15s | relay: ~$0.08 saved — composer-2.5 cost $0.02, baseline opus-5 would've cost ~$0.10 [measured] · out=552tok |
| 2 | read-only: review lane reports without touching files | mcp | ✅ pass | 18s | tree clean after review |
| 3 | no-op guard: nonexistent bug yields zero edits | mcp | ✅ pass | 16s | no invented edits |
| 4 | cwd guard: omitted cwd in non-repo dir is refused | mcp | ✅ pass | 0s | refused with actionable error |
| 5 | recursion guard: RELAY_WORKER server refuses relay_run | mcp | ✅ pass | 0s | hard refusal |
| 6 | brief coercion: string files/done_means accepted end-to-end | mcp | ✅ pass | 10s | string brief fields coerced, run succeeded |
| 7 | fire-and-poll: wait:false returns id fast; status reaches ok | mcp | ✅ pass | 15s | dispatch 20ms · 6 progress events · final ok |
| 8 | walkaway: build lane commits on relay/* branch, main untouched | mcp | ✅ pass | 76s | committed on relay/build-hg4mu2, main clean |
| 9 | bad directive: broken router.yaml errors readably | mcp | ✅ pass | 0s | readable field-level error |
| 10 | tool surface: doctor (fresh), savings, backends respond | mcp | ✅ pass | 11s | all respond · live auth → cursor:authed claude:authed codex:authed |
| 11 | memory: remember in one session, recall in the next (git+notes layers) | mcp | ✅ pass | 0s | note survived a fresh server · git+notes layers present |
| 12 | hostile directive: repo-committed worktree+autonomy grants are clamped | mcp | ✅ pass | 14s | worktree→tree and full→safe refused from a repo file |
| 13 | user config: the same worktree grant is honored when the user wrote it | mcp | ✅ pass | 12s | honored: work on relay/quickfix-31apvu |
| 14 | verify trust gate: repo-authored verify command is refused before any tokens | mcp | ✅ pass | 0s | refused, command shown, no edits |
| 15 | read-only enforcement: a review lane refuses an explicit write instruction | mcp | ✅ pass | 21s | explicit write instruction produced no files |
| 16 | host cursor-agent: 'relay this' delegates via MCP | host | ✅ pass | 27s | delegated (proof: run record with this scratch repo's cwd) · typo fixed (rule via project .cursor/rules — headless CLI skips global IDE rules) |
| 17 | host claude: 'relay this' delegates via MCP | host | ✅ pass | 22s | delegated · 2 run record(s) · typo fixed |
| 18 | host codex: 'relay this' delegates via MCP | host | ✅ pass | 49s | delegated (proof: run record with this scratch repo's cwd) · typo fixed |

MCP-layer scenarios drive `relay mcp serve` over stdio with the same protocol hosts use; host-layer scenarios run the real CLIs headless with a "relay this:" prompt and assert the delegation actually happened (run record + fixed file). Each scenario uses a fresh scratch repo and isolated XDG dirs — nothing touches the developer's real state.

Scenarios 12–15 are the permission posture: a repo-committed directive is refused the two grants that cost the user something, the identical grant is honored when the user wrote it themselves, a repo-authored verify command is refused before any tokens are spent, and a read-only lane declines an explicit instruction to write. Unit tests cover the flag mapping; these prove the posture survives a real delegated run, which is the only place the whole chain — directive → lane → backend flags → worker — actually runs.
