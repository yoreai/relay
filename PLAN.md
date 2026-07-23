# Relay — Design Record

> **One-line pitch:** an interface-independent task router. You (or your agent) hand Relay a task
> in plain English; a shareable *directive* decides which headless backend and model is the
> cheapest-and-fastest that can do it well; Relay runs it, verifies it, escalates only when needed,
> and prints a receipt for what it saved you.

> **Status:** built and shipping (see `CHANGELOG.md` for release history, `README.md` for install/use).
> This file is the **locked design record** — product decisions, architecture intent, and open
> questions. It is deliberately *not* a changelog or a user guide; those live elsewhere.

> **Origin:** designed 2026-07-19 in conversation with Yev. Personal open-source project under the
> **yoreai** GitHub identity — deliberately NOT coupled to Abridge/apex/Frankie. Frankie is one
> optional backend adapter, never the center.

---

## 1. Why this exists (the problem)

- Running a frontier model on *everything* — including watchers that poll dashboards every 5
  minutes and Slack-drafting chores — produces absurd bills. The work mix is ~70% mechanical tasks
  a mid-tier model handles fine.
- Cursor's **Auto** routing isn't trusted for this: routing decisions are opaque and vary
  mid-session. The user wants routing policy to be **theirs** — a versioned, auditable, shareable
  file — not a black box.
- Model-switching by hand doesn't happen in practice. The interface must make the *right* choice
  the *default* choice.
- Key insight: every major agent surface (Cursor IDE, Claude Code, Codex, terminals) can either
  invoke a CLI or speak MCP. So the router can sit **below** all of them — one brain, any front-end.

**Savings thesis:** routing (this tool) × minimal context assembly (§4) × fresh short sessions
≈ 10–20x on watcher/routine load, 2–4x on hard tasks (escalations still land on big models).
Compression proxies like `headroomlabs-ai/headroom` are a *complementary third layer* (they compress
tokens in flight; we choose model + context) — do not rebuild that here. Authoritative prices live
in `defaults/catalog.yaml`, not in this file.

---

## 2. Product decisions already made (do not relitigate without the owner)

1. **Name:** `relay` (binary + repo name). Working name is final enough to build. Known
   collisions: bare `relay` on npm is taken (ancient flow-control lib), `relay-cli` taken. Neither
   matters: brew tap namespaces the formula, npm ships (later, SDK-only) as a scoped package.
2. **Standalone open-source project under `yoreai`** — Apache-2.0, its own repo. NOT under
   Abridge, NOT inside apex, NOT an extension of the `fr` CLI (that tool is plan-ceremony-shaped;
   this one is "just do it"-shaped). Frankie integration ships as an *adapter*, ideally in a
   separate plugin package, so the core has zero Abridge references.
3. **Runtime: Bun + TypeScript, compiled to a single self-contained binary** (`bun build
   --compile`). No Node/npm required on user machines.
4. **Distribution: Homebrew tap first** (`brew install yoreai/tap/relay`). Formula downloads the
   binary from GitHub Releases. Linux/CI: curl install script. npm later as scoped SDK only.
5. **Two invocation mouths:** human CLI and MCP server (`relay mcp serve`). MCP is what makes it
   interface-independent — Cursor/Claude Code/Codex agents call `relay_run` as a tool and delegate
   sub-tasks to cheap headless runs.
6. **Git-native visibility:** sub-agent edits happen in the caller's working tree and are
   **staged** by default (per-lane override: `worktree` → branch/patch for walkaway lanes). Host
   IDEs show the changes as normal file/source-control changes — NOT in their proprietary
   AI-review UIs; git diff IS the review surface. Never commit without the lane saying so.
7. **The directive is the shareable artifact.** People exchange `router.yaml` files, not tribal
   knowledge. Repo-level `./router.yaml` (or `.relay/router.yaml`) overrides
   `~/.config/relay/router.yaml`.
8. **Savings receipts are built-in but honest** — counterfactual estimates labeled as such (§5).
9. **Auth is delegated.** Relay stores no credentials. Each backend CLI owns its own auth;
   `relay doctor` checks and prints exactly what to run.
10. **Model choice policy:** the directive maps *lanes → capability tiers* and a single
    `tiers:` table maps tiers → concrete models. Tiers accept an ordered fallback list; the first
    candidate whose backend CLI is installed wins, so a single-backend machine routes every tier
    with zero config. Updating for a new model = editing one table (or running `relay advise`).

---

## 3. Architecture

```
 any front-end                 relay core                       backends
┌───────────────┐   CLI   ┌──────────────────────┐   spawn   ┌──────────────────┐
│ human in term │────────▶│ 1 parse task/brief   │──────────▶│ cursor-agent CLI │
│ Cursor agent  │  MCP    │ 2 assemble context   │           │ claude -p        │
│ Claude Code   │────────▶│ 3 route (directive)  │           │ codex exec       │
│ Codex / bots  │         │ 4 run backend        │   MCP     │ gemini/grok/kimi │
└───────────────┘         │ 5 verify             │──────────▶│ (spec-driven)    │
                          │ 6 widen → escalate   │           │ frankie adapter  │
        git (staged) ◀────│ 7 receipt + log       │           │ (plugin, optional)│
        = visibility      └──────────────────────┘           └──────────────────┘
```

The core loop is `route → assemble → backend → verify → widen/escalate → receipt`. Current module
layout lives in `src/` (see `AGENTS.md` for the quick reference and `src/cli.ts` / `src/run.ts` as
entry points); it is intentionally not frozen here — it evolves with the code. The conceptual
stages above are the stable contract.

---

## 4. The brief (context contract)

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
(§3). Thin briefs self-heal mechanically; fat context is only paid for after thin context
demonstrably failed.

---

## 5. Savings accounting (the receipt)

- Directive has `baseline:` + the price table (ship a `prices.yaml` with the tier table; let the
  directive override; `defaults/catalog.yaml` fills prices for models missing from `prices.yaml`).
  After each run:
  `saved = tokens_in×(P_base_in−P_used_in) + tokens_out×(P_base_out−P_used_out)`.
- Print one quiet line: `relay: ~$1.84 saved (grok-4.5 vs fable-5-high) [estimated]`.
- `relay savings` → cumulative, split by lane/model, **measured vs estimated labeled per row**
  (claude/codex backends = measured; cursor backend = estimated from bytes until its CLI emits
  usage).
- Log every run to `runs.jsonl`: `{ts, lane, backend, model, tokens_in/out (or est),
  verify_result, escalations, saved_usd, task_hash}` — NO task text by default (privacy);
  `--log-tasks` opt-in.
- **Never fabricate precision.** If we can't price something, the receipt says so.

## 6. Backends — constraints

- Common interface: `run(brief, model, opts) → {output, filesChanged, usage?, exitCode}`.
- **cursor** — Cursor CLI does **not** emit token usage in result events (verified: "Tokens:
  unavailable"). Estimate usage from I/O bytes (§5) until fixed upstream. Binary discovery:
  `cursor-agent` or `agent` on PATH (users alias it); make it configurable.
- **claude / codex** — DO emit usage in their result event. Respect user aliases; never pass
  `--dangerously-skip-permissions` ourselves — permission posture belongs to the user's own config.
- **gemini / grok / kimi** — spec-driven generic CLI backend; adding a new agent CLI is one table
  entry. Mark `verified: false` until tested against a real install.
- **frankie adapter (separate package/dir)** — the "walkaway" backend for repos that have Frankie.
  **Core must build and test cleanly with this adapter absent.** This is the only sanctioned
  Abridge/Frankie surface; the core has zero such references (enforced by `AGENTS.md`).

---

## 7. Risks / honest caveats (tell the user, don't hide)

- **Cursor CLI usage gap** → estimated receipts on that backend (said on the receipt).
- **Fresh short sessions lose accumulated judgment** — mitigation is brief quality + beads
  hygiene, not bigger contexts. Relay is only as smart as its briefs.
- **Cheap-model wrongness costs review cycles** — the verify/escalate ladder bounds it, but
  `done_means` quality is the real control. Push callers to write verifiable acceptance.
- **Model IDs/prices drift** — everything lives in directive/catalog data files; nothing hardcoded.
- **Backend CLI flags drift** — adapters must feature-detect (`--help` probe or version gate),
  fail with actionable messages, never crash relay core.

---

## 8. Open questions for the owner

1. Final public name check when open-sourcing widely (bare `relay` is fine for tap; revisit if it
   ever goes registry-global). — *Still open.*
2. Classifier default: on or off? — *Resolved: on, nano-tier (see `defaults/router.yaml`).*
3. Should `build`-lane worktree runs auto-open a PR when `gh` is present? — *Resolved: yes, draft
   PR on a `relay/*` branch, never auto-merged.*
4. Telemetry: none beyond local `runs.jsonl`? — *Resolved: yes — no telemetry, no phone-home
   (only pull-only catalog/release checks via `relay update`).*

---

*This is a design record, not a build handover. For the current build, read `src/`; for releases,
`CHANGELOG.md`; for install/use, `README.md`; for the maintenance playbook, `AGENTS.md`.*
