# Relay — Build Plan & Agent Handover

> **One-line pitch:** an interface-independent task router. You (or your agent) hand Relay a task
> in plain English; a shareable *directive* decides which headless backend and model is the
> cheapest-and-fastest that can do it well; Relay runs it, verifies it, escalates only when needed,
> and prints a receipt for what it saved you.
>
> **Status:** fully designed, not yet built. This document is the complete handover — a fresh
> agent should be able to build v1 from this file alone.
>
> **Origin:** designed 2026-07-19 in conversation with Yev. Personal open-source project under the
> **yoreai** GitHub identity — deliberately NOT coupled to Abridge/apex/Frankie. Frankie is one
> optional backend adapter, never the center.

---

## 1. Why this exists (the problem)

- Running a frontier model (Claude Fable 5, 1M ctx, high thinking) on *everything* — including
  watchers that poll dashboards every 5 minutes and Slack-drafting chores — produces absurd bills.
  The work mix is ~70% mechanical tasks a mid-tier model handles fine.
- Cursor's **Auto** routing isn't trusted for this: routing decisions are opaque and vary
  mid-session. The user wants routing policy to be **theirs** — a versioned, auditable, shareable
  file — not a black box.
- Model-switching by hand doesn't happen in practice. The interface must make the *right* choice
  the *default* choice.
- Key insight: every major agent surface (Cursor IDE, Claude Code, Codex, terminals) can either
  invoke a CLI or speak MCP. So the router can sit **below** all of them — one brain, any front-end.

**Cost reference (July 2026, per 1M tokens, via Cursor docs + launch posts):**

| Model | In | Out | Cache-read | Notes |
|---|---|---|---|---|
| GPT-5.6 Luna | $1 | $6 | $0.10 | cheapest cache reads → watchers/pollers |
| GLM 5.2 | $1.40 | $4.40 | $0.26 | cheapest output |
| Grok 4.5 (base) | $2 | $6 | $0.50 | Opus-class coding at ~4x fewer tokens/task; in Cursor's included first-party pool |
| Grok 4.5 Fast | $4 | $18 | — | speed play for interactive waits |
| Claude Opus 4.8 | $5 | $25 | $0.50 | precision: reviews, refactors, incidents |
| GPT-5.6 Sol | $5 | $30 | — | frontier OpenAI |
| Claude Fable 5 | $10 | $50 | $1 | hardest reasoning ONLY, never the default |

Benchmarked *effective* cost per solved coding-agent task: Grok 4.5 ≈ $1.60 vs Fable 5 ≈ $11.80
at near-equal scores (Coding Agent Index gap: 1 point). Prices WILL drift — hence the directive's
tier table is data, not code (§4).

**Savings thesis:** routing (this tool) × minimal context assembly (§6) × fresh short sessions
≈ 10–20x on watcher/routine load, 2–4x on hard tasks (escalations still land on big models).
Compression proxies like `headroomlabs-ai/headroom` are a *complementary third layer* (they
compress tokens in flight; we choose model + context) — do not rebuild that here.

---

## 2. Product decisions already made (do not relitigate without the owner)

1. **Name:** `relay` (binary + repo name). Working name is final enough to build. Known
   collisions: bare `relay` on npm is taken (ancient flow-control lib), `relay-cli` taken. Neither
   matters: brew tap namespaces the formula, npm ships (later, SDK-only) as a scoped package.
   No bare `relay` formula exists in homebrew-core (checked 2026-07-19).
2. **Standalone open-source project under `yoreai`** — Apache-2.0, its own repo. NOT under
   Abridge, NOT inside apex, NOT an extension of the `fr` CLI (that tool is plan-ceremony-shaped;
   this one is "just do it"-shaped). Frankie integration ships as an *adapter*, ideally in a
   separate plugin package, so the core has zero Abridge references.
3. **Runtime: Bun + TypeScript, compiled to a single self-contained binary** (`bun build
   --compile`). No Node/npm required on user machines.
4. **Distribution: Homebrew tap first** (`brew install yoreai/tap/relay` — the tap repo
   `yoreai/homebrew-tap` does not exist yet; create it). Formula downloads the binary from GitHub
   Releases. Linux/CI: curl install script. npm later as scoped SDK only. MDM/fleet pre-install is
   a downstream option once brew exists.
5. **Two invocation mouths:** human CLI and MCP server (`relay mcp serve`). MCP is what makes it
   interface-independent — Cursor/Claude Code/Codex agents call `relay_run` as a tool and delegate
   sub-tasks to cheap headless runs.
6. **Git-native visibility:** sub-agent edits happen in the caller's working tree and are
   **staged** by default (per-lane override: `worktree` → branch/patch for walkaway lanes). Host
   IDEs show the changes as normal file/source-control changes — NOT in their proprietary
   AI-review UIs; git diff IS the review surface. Never commit without the lane saying so.
7. **The directive is the shareable artifact.** People exchange `router.yaml` files, not tribal
   knowledge. Repo-level `./router.yaml` (or `.relay/router.yaml`) overrides `~/.config/relay/router.yaml`.
8. **Savings receipts are built-in but honest** — counterfactual estimates labeled as such (§7).
9. **Auth is delegated.** Relay stores no credentials. Each backend CLI owns its own auth;
   `relay doctor` checks and prints exactly what to run (`cursor-agent login`, `claude` OAuth...).
10. **Model choice policy:** the directive maps *lanes → capability tiers* and a single
    `tiers:` table maps tiers → concrete models. Auto-detect available models where the backend
    CLI can list them; fall back to the tier table. Updating for a new model = editing one table.

---

## 3. Architecture

```
 any front-end                 relay core                       backends
┌───────────────┐   CLI   ┌──────────────────────┐   spawn   ┌──────────────────┐
│ human in term │────────▶│ 1 parse task/brief   │──────────▶│ cursor-agent CLI │
│ Cursor agent  │  MCP    │ 2 assemble context   │           │ claude -p        │
│ Claude Code   │────────▶│ 3 route (directive)  │           │ (codex later)    │
│ Codex / bots  │         │ 4 run backend        │   MCP     │ frankie adapter  │
└───────────────┘         │ 5 verify             │──────────▶│ (plugin)         │
                          │ 6 widen → escalate   │           └──────────────────┘
        git (staged) ◀────│ 7 receipt + log      │
        = visibility      └──────────────────────┘
```

Module layout (suggested):

```
src/
  cli.ts              # arg parsing, subcommands
  directive.ts        # load/merge/validate router.yaml (zod schema)
  brief.ts            # brief schema + validation
  context/
    assemble.ts       # git status/diff, named files, AGENTS.md
    beads.ts          # OPTIONAL provider: `bd` graph pull (feature-detect `bd` on PATH)
  route.ts            # rules-first matcher + optional nano-model classifier
  backends/
    types.ts          # Backend interface: {run(brief, model, opts) → Result}
    cursor.ts         # cursor-agent adapter
    claude.ts         # claude -p adapter
  verify.ts           # run lane's verify commands; parse pass/fail
  escalate.ts         # widen-context → bump-tier ladder
  savings.ts          # price table math, receipts, cumulative log
  runlog.ts           # append-only JSONL: ~/.local/share/relay/runs.jsonl
  mcp.ts              # MCP server: relay_run, relay_status, relay_savings
  doctor.ts           # backend presence/auth/model checks
```

---

## 4. The directive (`router.yaml`) — schema + starter default

```yaml
version: 1
baseline: fable-5-high          # what the user would have used — savings counterfactual
tiers:                          # ONE place that changes as the model market moves
  nano:    { backend: cursor, model: gpt-5.6-luna,  effort: low }
  cheap:   { backend: cursor, model: glm-5.2 }
  work:    { backend: cursor, model: grok-4.5 }     # the default workhorse
  fast:    { backend: cursor, model: grok-4.5-fast }
  review:  { backend: cursor, model: opus-4.8-high }
  deep:    { backend: cursor, model: fable-5-high }
lanes:
  - name: status
    match: { verbs: [status, summarize, watch, check, list, read] }
    tier: nano
    write: none                  # read-only lane: no file edits allowed
  - name: quickfix
    match: { verbs: [fix, rename, update, bump, add-test], max_files: 5 }
    tier: work
    verify: [lint, test]         # resolved per-repo, see below
    write: stage                 # edits land staged in the working tree
  - name: build
    match: { verbs: [build, implement, feature], walkaway: true }
    tier: work
    write: worktree              # isolated worktree → branch (+ PR if gh present)
  - name: review
    match: { verbs: [review, diagnose, root-cause, audit] }
    tier: review
    write: none
default_lane: quickfix
escalation:
  widen_after: 1                 # 1st failure → widen context (one more beads hop / more files)
  escalate_after: 2              # 2nd failure → bump tier (work → review → deep), max 1 bump
verify_commands:                 # fallbacks; prefer repo config (Makefile/package.json/.relay.yaml)
  lint: "auto"                   # auto = detect (turbo lint / ruff / eslint ...)
  test: "auto"
classifier:                      # only for asks the rules can't place
  tier: nano
  enabled: true
```

Routing = rules first (verbs, file globs, diff-size hints, `walkaway` flag); if no rule matches
confidently and the classifier is enabled, ONE nano-model call decides the lane (directive text is
embedded in that prompt). A routing decision must cost ≈ nothing.

## 5. The brief (context contract)

```ts
type Brief = {
  goal: string;            // one sentence, imperative
  why?: string;            // optional intent
  files?: string[];        // paths the task centers on
  constraints?: string[];  // "don't touch X", "keep API stable"
  done_means: string[];    // verifiable acceptance ("test Y passes", "lint clean")
  context?: string;        // freeform, budget-capped
};
```

**Who assembles it — the rule: whoever understands the task pays for the brief.**
- **MCP callers** (an expensive agent mid-session) pass a curated brief; relay passes it through
  verbatim (it already paid to understand the problem — best possible assembler).
- **CLI humans** get relay's assembler: `bd` graph (target bead + 1 hop + relevant remembers —
  ONLY if `bd` exists), `git status`+diff, files named in the task, repo AGENTS.md. Hard token
  budget (default ~30k chars; configurable).

Small-context safety comes from the loop, not from stuffing context: **verify → widen → escalate**
(§4 escalation). Thin briefs self-heal mechanically; fat context is only paid for after thin
context demonstrably failed.

## 6. Backends

Common interface: `run(brief, model, opts) → {output, filesChanged, usage?, exitCode}`.

- **cursor.ts** — spawn `cursor-agent` headless (`-p/--print` mode) with `--model <id>`,
  `--output-format stream-json` where available; cwd = caller's repo (or worktree per lane).
  ⚠️ Known gap: Cursor CLI does **not** emit token usage in result events (verified in apex's
  runner: "Tokens: unavailable"). Estimate usage from I/O bytes (§7) until fixed upstream.
  Binary discovery: `cursor-agent` or `agent` on PATH (users alias it); make it configurable.
- **claude.ts** — `claude -p "<prompt>" --output-format stream-json --model <id>`; DOES emit
  usage in its result event. Respect user aliases; never pass `--dangerously-skip-permissions`
  ourselves — permission posture belongs to the user's own config.
- **frankie adapter (separate package/dir, build LAST)** — calls the Frankie MCP's
  `frankie_handover` with the brief (that MCP already does lite-vs-plan routing server-side),
  prints session/PR link; `relay status` polls `frankie_status`. This is the "walkaway" backend
  for repos that have Frankie. Core must build+test cleanly with this adapter absent.
- **codex** — same pattern as claude; not v1.

## 7. Savings accounting (the receipt)

- Directive has `baseline:` + the price table (ship a `prices.yaml` with the tier table; let the
  directive override). After each run:
  `saved = tokens_in×(P_base_in−P_used_in) + tokens_out×(P_base_out−P_used_out)`.
- Print one quiet line: `relay: ~$1.84 saved (grok-4.5 vs fable-5-high) [estimated]`.
- `relay savings` → cumulative, split by lane/model, **measured vs estimated labeled per row**
  (claude backend = measured; cursor backend = estimated from bytes until its CLI emits usage).
- Log every run to `runs.jsonl`: `{ts, lane, backend, model, tokens_in/out (or est), verify_result,
  escalations, saved_usd, task_hash}` — NO task text by default (privacy); `--log-tasks` opt-in.
- Never fabricate precision. If we can't price something, the receipt says so.

## 8. CLI surface (v1)

```
relay "fix the flaky retry test in src/api"      # route → run → verify → receipt
relay -i                                          # REPL: type asks, watch routing live
relay status [id|--all]                           # running/recent runs (incl. frankie lane)
relay savings [--by-lane|--by-model]
relay doctor                                      # backends found? authed? models listable?
relay init                                        # write starter router.yaml (+ detect repo tools)
relay mcp serve                                   # MCP server over stdio
relay --lane build "…" / --tier deep "…" / --dry-run (print routing+brief, run nothing)
```

MCP tools: `relay_run(task, brief?, lane?)`, `relay_status(id?)`, `relay_savings()`.
`relay_run` returns the result summary + files changed + receipt; long runs support a
fire-and-poll mode (`wait: false` → id).

## 9. Milestones (each independently shippable)

- **M1 — happy path:** directive load/validate, rules router, cursor backend, staged writes,
  run log. `relay "task"` works end-to-end in a repo. Unit tests: routing, directive validation.
- **M2 — the loop:** verify commands (auto-detect + config), widen→escalate ladder, claude
  backend. Integration tests with a FAKE backend binary (fixture script that echoes
  stream-json) — never require real CLIs/auth in CI.
- **M3 — MCP server:** stdio server, 3 tools, works from Cursor + Claude Code configs
  (document the two config snippets in README).
- **M4 — receipts:** prices.yaml, savings math, `relay savings`, estimated-vs-measured labels.
- **M5 — packaging:** `bun build --compile` per-arch (darwin-arm64 first), GitHub Release
  workflow (copy the tag-triggered fan-out *pattern* from `~/dev/my/aresadb`
  `.github/workflows/release.yml` — same trigger shape, swap publish jobs for a release-binary
  job), create `yoreai/homebrew-tap` with the formula, curl install script.
- **M6 — frankie adapter** (separate dir/package) + `relay status` polling for it.
- **Not v1:** codex backend, Windows, npm SDK, output-compression (headroom's job), MDM docs.

## 10. Repo conventions (copy the aresadb muscle)

- Apache-2.0 LICENSE, README with a 60-second install/use section, CHANGELOG.md (keep-a-changelog),
  `AGENTS.md` (source-of-truth file list; no TODO.md — use the changelog + issues),
  `.cursor/rules/release-checklist.mdc` mirroring aresadb's (version bump spots + tag ritual).
- Remote (owner will wire it): `git@github-personal:yoreai/relay.git`. Local git identity is
  already set (yoreai / 2724321+yoreai@users.noreply.github.com).
- CI: bun test + typecheck on PR; release on tag.

## 11. Risks / honest caveats (tell the user, don't hide)

- **Cursor CLI usage gap** → estimated receipts on that backend (say it on the receipt).
- **Fresh short sessions lose accumulated judgment** — mitigation is brief quality + beads
  hygiene, not bigger contexts. Relay is only as smart as its briefs.
- **Cheap-model wrongness costs review cycles** — the verify/escalate ladder bounds it, but
  `done_means` quality is the real control. Push callers to write verifiable acceptance.
- **Model IDs/prices drift** — everything lives in directive/prices data files; nothing hardcoded.
- **Backend CLI flags drift** — adapters must feature-detect (`--help` probe or version gate),
  fail with actionable messages, never crash relay core.

## 12. Open questions for the owner (don't block v1 on these)

1. Final public name check when open-sourcing widely (bare `relay` is fine for tap; revisit if it
   ever goes registry-global).
2. Classifier default: on or off? (Plan default: on, nano-tier, ~free.)
3. Should `build`-lane worktree runs auto-open a PR when `gh` is present? (Plan default: yes,
   draft PR.)
4. Telemetry: none beyond local runs.jsonl (plan default) — confirm.

---

*Handover complete. A fresh agent should start at M1 with `bun init`, port the directive schema
above into zod, and keep every design decision in §2 unless the owner says otherwise.*
