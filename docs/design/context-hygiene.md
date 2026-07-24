# Context Hygiene: `relay setup` provisions the whole delegate-and-checkpoint pattern

Status: **exploration, not a commitment.** `PLAN.md` remains the record of locked
decisions; this file is the long-form thinking behind one direction, kept so the
analysis isn't re-derived. No `src/` code is changed by this doc.

Since it was written, capability 3 (checkpoint) shipped in part as **relay memory**
(v0.7.0 — `relay_recall` / `relay_remember`, `PLAN.md` §5b). Capabilities 1, 2 and 4
(subagents, delegate-first policy, watchdog hooks) were **deliberately deferred** by
the owner in favour of doing memory well first, on the grounds that per-host hooks and
skills are fragile and memory alone removes the reason people keep bloated sessions
alive. Treat §3's slice order as an option, not a roadmap.

---

## 1. Problem statement

relay today lowers the cost of an *individual* task: `relay_run` routes a
sub-task to the cheapest model that clears its quality bar, verifies with the
repo's own lint/tests, and leaves the edits in the working tree for review
(`src/run.ts`, `src/mcp.ts`). That is real savings, but it is the smaller lever.

The bigger lever is **context hygiene**. A frontier coding session re-bills its
*entire* context on every turn (mostly at cache-read prices, but re-billed
nonetheless). Two consequences:

1. **A live context can never be cleaned — only kept lean and abandoned early.**
   Once a huge diff, a log dump, or a Slack thread lands in the session, it is
   paid for again on every subsequent turn until the chat ends. There is no
   "garbage collect the context" primitive; the only real levers are (a) never
   let bulky raw material enter the frontier context in the first place, and
   (b) end the session and start fresh once it has bloated.
2. **Humans will not remember to do either.** The discipline of "delegate the
   reading, checkpoint, start a new chat" is exactly the kind of thing that
   erodes under deadline pressure.

The goal: `brew install relay && relay setup` should **provision the entire
pattern** across Cursor, Claude Code, and Codex so no human has to remember
anything. The policy delegates, a hook nudges, and the only human action left is
clicking "new chat".

### Design principles (must hold for every capability below)

- **Zero-thought UX.** The user installs once; thereafter the machine does the
  remembering. The single residual human action is starting a new chat.
- **Managed, idempotent, cleanly uninstallable.** Everything ships as a managed
  block or a managed file that `relay setup` can rewrite in place and
  `relay uninstall` can remove exactly — the same mechanism relay already uses
  for its activation block (`src/activation.ts`, `src/uninstall.ts`).
- **Fail open.** A watchdog hook or a missing tool must never break the user's
  session. Any error path exits silently and lets the agent proceed.
- **Savings are measured, not vibes.** relay already emits receipts
  (`src/run.ts` `makeReceipt`, `relay_savings`); new capabilities should feed the
  same measurement surface where they can, and be honest where they can't yet.

---

## 2. Capability map: EXISTS / PARTIAL / NET-NEW

Five capabilities `relay setup` should provision. Each is labelled against the
current codebase with the file(s) that back the claim. All five must ship as
managed, idempotent, uninstallable blocks/files.

| # | Capability | Status | Backing files (what already exists) |
|---|------------|--------|--------------------------------------|
| 1 | Cheap-reader subagents (`~/.cursor/agents/*.md`, `~/.claude/agents/*.md`) | **NET-NEW** | Nothing installs agent files today. Closest existing mechanism: `installActivationHints` in `src/activation.ts` writes per-host files and a Cursor rule. |
| 2 | Delegate-first policy (Cursor skill + managed `CLAUDE.md` section) | **PARTIAL** | `src/activation.ts` already manages a fenced `CLAUDE.md`/`AGENTS.md` block and a Cursor `.mdc` rule — but it only covers "relay this" activation, not a delegate-first policy or a Cursor *skill*. |
| 3 | Checkpoint (externalize session state for cold resume) | **PARTIAL** | `src/memory.ts` (per-repo notes + recall digest), `src/mcp.ts` `relay_remember`/`relay_recall`, `src/context/beads.ts` (read-only `bd` pull). Covers durable memory; does NOT cover a structured session checkpoint or writing beads/HANDOFF. |
| 4 | Context-watchdog hooks (`~/.cursor/hooks.json` + Claude equivalent) | **NET-NEW** | No hook is installed or managed anywhere in `src/`. Prototype exists (see §5). |
| 5 | relay core (`relay_run`, `relay_doctor`/`relay_login`, savings receipts) | **EXISTS** | `src/run.ts`, `src/mcp.ts`, savings via `makeReceipt` (`src/run.ts`) + `relay_savings`/`summarizeSavings`. Unchanged by this design. |

### 1. Cheap-reader subagents — NET-NEW

Four read-oriented subagents, installed globally and pinned to a cheap model:

- **`pr-evidence`** — PR/diff/CI-log digests.
- **`log-digger`** — observability timelines (Datadog/GCP/kubectl).
- **`slack-context`** — Slack thread digests; strictly read-only, never posts.
- **`test-runner`** — runs tests/linters and triages output; never fixes.

Target locations:
- Cursor: `~/.cursor/agents/*.md`, pinned to a cheap model slug, `readonly: true`
  where the harness supports it.
- Claude Code: `~/.claude/agents/*.md`, pinned to `haiku`.

**Why the `description` frontmatter matters:** in Cursor the subagent
`description` is what drives *automatic* delegation by the parent agent, so it
must carry "use proactively" language. This is the load-bearing field, not the
body.

**Project override:** project-level same-named subagents (`.cursor/agents/…` in a
repo) override the global ones, so a repo can ship specializations without the
user re-installing anything.

**What's missing in `src/` today:** there is no code that writes agent files.
`src/activation.ts` demonstrates the *pattern* we'd extend (per-host file writes,
`installActivationHints` / `removeActivationHints`, backed by `mergeMcpJson`-style
idempotent merges), but it writes only the "relay this" activation rule/block —
not subagents. `src/setup.ts` orchestrates host detection (`probeTools`,
`discoverCursorBinary`, `discoverClaudeBinary`) and would gate which agent dirs
to populate; that detection already exists and is reusable.

### 2. Delegate-first policy — PARTIAL

The policy: **cheap models read, the frontier model judges.** Delegate whenever
raw material would exceed ~100 lines; route mechanical edits to `relay_run`.

**Non-negotiable quality floor** (never delegate): review verdicts and the
wording of review comments; anything posted under a human's identity;
architecture/design decisions; anything touching deploys or credentials.

**Where it must live.** An important Cursor constraint (confirmed against the
prototype's framing, and the reason the policy is split): **Cursor has no
global/user rules file.** The only machine-wide surfaces are subagent
descriptions, skills, and (enterprise only) Team Rules in the admin dashboard. So
the policy has to ride in:
- a Cursor **skill** at `~/.cursor/skills/delegate-cheap/SKILL.md`, plus
- the subagent **descriptions** themselves (capability 1), plus
- a managed **`CLAUDE.md` section** for Claude Code (Codex reads `AGENTS.md`).

**What already exists (PARTIAL):** `src/activation.ts` already:
- manages a marker-fenced block (`BEGIN/END RELAY ACTIVATION`) via
  `mergeActivationBlock` / `removeActivationBlock` and upserts it into
  `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` (`upsertMemoryFile`);
- writes a Cursor rule file at `~/.cursor/rules/relay.mdc` (`cursorRulePath`,
  `installActivationHints`).

So the *managed-block-in-CLAUDE.md* half of this capability is a direct extension
of existing code. **What's missing:** (a) the content is "relay this" activation,
not a delegate-first policy + quality floor; (b) relay installs a Cursor *rule*
(`.mdc`), not a Cursor *skill* under `~/.cursor/skills/` — no skill-writing code
exists today; (c) uninstall (`removeActivationHints` in `src/activation.ts`,
called from `src/uninstall.ts`) would need to learn about the new skill file and
any new managed section.

### 3. Checkpoint — PARTIAL (assessed honestly)

Checkpoint = how a session externalizes state so it can be killed early and
resumed cold: done work with artifact links; in-flight tasks with exact next
steps and IDs; decisions taken; watchouts. Store order: **beads (`bd`) if the
repo has it, else the ticket, else a dated `HANDOFF.md`.**

**How much does relay's existing memory layer already cover?** (v0.7.0 "relay
remembers", `relay recall`.) Reading the code carefully:

- `src/memory.ts` implements per-repo durable notes keyed by git root
  (`memoryRepoKey`, `memoryPath`) via `rememberNote`, and a deterministic
  `recallDigest` that blends git state + relay runs + notes + host sessions.
  `relay_remember` / `relay_recall` expose this over MCP (`src/mcp.ts`).
- **Crucially, memory is NOT written only after relay runs.** `rememberNote`
  accepts an *arbitrary* one-line note from any caller (`source: "mcp" | "cli"`),
  so a session can already deposit a decision/next-step/watchout at any moment,
  not just as a side effect of `relay_run`. The activation block even instructs
  agents to do exactly this ("When the user says 'remember this' … deposit ONE
  line via `relay_remember`").

So the **durable-knowledge** slice of checkpoint largely EXISTS. What is
**genuinely missing**:

- **Structured, multi-part checkpoint.** `rememberNote` is one line, ≤2000 chars,
  tagged with a `kind` from a fixed set (`decision | todo | context | watchout |
  note`, `NOTE_KINDS` in `src/memory.ts`). It captures conclusions, deliberately
  *not* transcripts (the length guard says so). A checkpoint's "in-flight task
  with exact next step and IDs, plus artifact links" is richer than one tagged
  line — today you'd approximate it as several separate notes, with no grouping.
- **Writing to beads / ticket / HANDOFF.md.** `src/context/beads.ts` only
  *reads* beads (`bd ready --json` / `bd show <id> --json`) as context input to a
  run — it never writes. There is no `bd update`/`bd create`/`bd remember` path,
  no ticket writer, and no `HANDOFF.md` writer anywhere in `src/`. relay's
  memory is its own JSONL store (`relayDataDir()/memory/*.jsonl`), which is not
  the beads-first store the checkpoint spec asks for.
- **A "checkpoint now" affordance.** There's no skill/command that packages
  "dump done/in-flight/decisions/watchouts to the right store" — the prototype
  ships this as `skills/checkpoint/SKILL.md` (§5).

**Net:** the *storage substrate* for durable one-liners exists and is
arbitrary-write-capable; the *structured checkpoint format*, the *beads/ticket/
HANDOFF write targets*, and the *skill that triggers it* are missing.

### 4. Context-watchdog hooks — NET-NEW

The headline UX: *"your context is bloated, I already have your state, start a
new session and save money."*

Cursor implementation (per prototype, §5): a **user-level** hook at
`~/.cursor/hooks.json` on the `postToolUse` event, running a script that:
- counts tool calls per session id (state file keyed by session id under
  `TMPDIR`);
- past a threshold (**default 120 calls**, re-nudge every **60**), returns JSON
  `{additional_context: "…"}` telling the agent to checkpoint and then tell the
  user in one line that a fresh chat is cheaper;
- **fails open** (any error → exit 0, no output);
- must **not interrupt mid-task** (nudge only, delivered as additional context);
- thresholds configurable via env (`CONTEXT_WATCH_THRESHOLD`,
  `CONTEXT_WATCH_RENUDGE`).

Claude Code needs an **equivalent hook** (its hook surface differs; the count-
and-nudge logic is portable, the wiring is not).

**Tool-call count is a proxy for context size.** Note as a future upgrade: use
real token counts wherever a harness exposes them.

**What's missing in `src/`:** nothing installs, manages, or removes a hooks file.
This is fully net-new. It must, like everything else, be idempotent (rewritable
in place) and uninstallable — and `~/.cursor/hooks.json` may already contain the
user's own hooks, so installation must merge (append to the `postToolUse` array)
rather than overwrite, mirroring the merge discipline of `mergeMcpJson` in
`src/setup.ts`.

### 5. relay core — EXISTS (unchanged)

Stated for completeness; this capability is not modified by this design.

- `relay_run` — curated briefs, cheapest-model-that-clears-the-bar routing,
  verify-then-escalate, edits left **unstaged in the working tree** for human
  review (auto-staging was removed in v0.6.18), `cwd` required. Backed by
  `src/run.ts` (`runTask`: route → assemble → backend → verify → widen/escalate →
  receipt) and `src/mcp.ts` (`relay_run` handler, `requireRunCwd`,
  `RELAY_WORKER` recursion guard).
- `relay_doctor` / `relay_login` — `src/mcp.ts` (`probeTools`, `runLogin`).
- Measured savings receipts — `makeReceipt` in `src/run.ts`, surfaced via
  `relay_savings` (`summarizeSavings`) and stored in `runs.jsonl`.

Two adjacent facts worth noting for the builder:
- **Advise** (`src/advise.ts`) is the "same-quality, cheaper model" recommender
  for tiers — orthogonal to context hygiene, but part of the same "measured
  savings" ethos.
- **Context assembly** (`src/context/assemble.ts`) already trims to a
  `budgetChars` budget and pulls AGENTS.md/git/beads — this is relay keeping the
  *worker's* context lean, which is the same principle applied inward.

---

## 3. Implementation plan (ordered; smallest first shippable slice first)

Each slice is independently shippable, idempotent, and uninstallable. Reuse the
existing managed-block machinery in `src/activation.ts` and the merge/backup
discipline in `src/setup.ts` (`mergeMcpJson`, `.relay-bak` backups) throughout.

**Slice 0 — plumbing shared by everything (small).**
Generalize `src/activation.ts` so it can manage more than one payload:
- a helper that writes a whole managed *file* (subagent, skill, hook script)
  idempotently and records it for uninstall;
- extend `removeActivationHints` (called by `src/uninstall.ts`) to remove the new
  files/blocks too.
No behavior change to the existing activation block; just make the mechanism
reusable. Ship with tests mirroring the existing pure-function tests
(`mergeActivationBlock` style).

**Slice 1 — cheap-reader subagents (capability 1). Smallest user-visible win.**
Ship the four subagent `.md` files as embedded string constants (like
`EMBEDDED_*` in `src/embedded_defaults.ts`) and write them to `~/.cursor/agents/`
and `~/.claude/agents/` during `runSetup`, gated by the host detection already in
`src/setup.ts`. Pin cheap model slugs; set `readonly: true` for Cursor; keep the
"use proactively" descriptions. This delivers automatic delegation in Cursor with
no policy file at all (the descriptions do the work). Add removal to uninstall.

**Slice 2 — delegate-first policy (capability 2).**
Install `~/.cursor/skills/delegate-cheap/SKILL.md` and add a managed
delegate-first section (with the quality floor) to `~/.claude/CLAUDE.md` /
`~/.codex/AGENTS.md`, extending the fenced-block approach in `src/activation.ts`.
This makes the policy explicit for harnesses whose auto-delegation is weaker than
Cursor's. Ship after slice 1 so the skill can reference agents that already
exist.

**Slice 3 — context-watchdog hook, Cursor (capability 4). The headline UX.**
Install the `context-watch.sh` script + merge a `postToolUse` entry into
`~/.cursor/hooks.json` (merge, don't overwrite; back up first). Fail open, env-
configurable thresholds. The nudge text should point at whatever checkpoint
affordance exists at that point (initially `relay_remember`; later the checkpoint
skill from slice 5). Add hook removal to uninstall.

**Slice 4 — context-watchdog hook, Claude Code (capability 4, cont.).**
Port the same count-and-nudge behavior to Claude Code's hook surface. Separate
slice because the wiring differs even though the logic is shared.

**Slice 5 — checkpoint skill + write targets (capability 3). Largest.**
Ship `~/.cursor/skills/checkpoint/SKILL.md` (and the Claude/Codex equivalent
managed section) describing the beads → ticket → `HANDOFF.md` fallback. Decide
how much *writing* relay itself does vs. instructs the agent to do (see Open
Questions). At minimum, lean on the existing `relay_remember` substrate for
durable one-liners; add richer targets only if we choose to.

**Slice 6 — measurement.**
Wire whatever new savings signal we can (e.g. count nudges that led to a fresh
session) into the existing receipts/`relay_savings` surface so the headline claim
("start a new chat, save money") is measured, not asserted. Honest placeholder
until a real signal exists.

Rationale for the order: slices 1–2 provision the *delegation* half (keep bulk
material out of the frontier context) with the least new machinery; slices 3–4
provision the *nudge* half (abandon a bloated context early); slice 5 provisions
the *checkpoint* half that makes early abandonment safe; slice 6 closes the
measurement loop. Every slice degrades gracefully if later ones aren't installed.

---

## 4. Open questions

1. **Cheap model slugs to pin.** The prototype pins Cursor subagents to
   `composer-2.5-fast` and Claude to `haiku`. relay's own catalog
   (`src/embedded_defaults.ts`) knows `composer-2.5` and `haiku-4.5`. Should the
   installed subagents pin the exact catalog ids relay routes to (so receipts and
   subagents agree), or the harness-native slugs the subagent frontmatter
   expects? Note the AGENTS.md invariant: *never map a catalog id to a floating
   alias* — that invariant is about relay's backend id maps, but the spirit
   (pin, don't float) should guide the subagent slugs too.
2. **Does relay write the checkpoint, or only instruct the agent to?** Options:
   (a) skill-only — the agent writes beads/ticket/HANDOFF; relay ships no writer;
   (b) relay gains a `bd`/HANDOFF writer and a structured checkpoint note kind;
   (c) hybrid — relay stores the structured checkpoint in its own memory JSONL and
   the skill mirrors key lines to beads. Affects how much of §2.3's "missing"
   list we actually build.
3. **Should `relay_remember` gain structure** (a grouped, multi-field checkpoint
   record) or stay deliberately one-line? Changing it touches `src/memory.ts`
   (`NOTE_KINDS`, the 2000-char guard, `recallDigest` formatting) and the
   `relay_remember` MCP schema in `src/mcp.ts`.
4. **Claude Code hook surface.** Exact event name and JSON contract for the
   Claude equivalent of Cursor's `postToolUse` → `{additional_context}` need
   confirming against current Claude Code docs before slice 4.
5. **Real token counts vs. tool-call proxy.** Which harnesses expose per-session
   token usage to a hook today? Where available, prefer it over the tool-call
   count. Needs a docs pass per harness.
6. **Threshold defaults.** 120/60 comes from one smoke test (§5). Should defaults
   differ per harness (different average tool-call weight) or stay uniform and
   env-tunable?
7. **Interaction with relay's existing Cursor rule.** relay already writes
   `~/.cursor/rules/relay.mdc` (activation). Does the delegate-first policy fold
   into that rule, live in a separate rule, or live only in the skill +
   descriptions? (The "no global rules file" constraint argues for skill +
   descriptions, but a per-user `.mdc` rule is available and relay already uses
   one.)
8. **Uninstall completeness.** As we add files across `~/.cursor/agents`,
   `~/.claude/agents`, `~/.cursor/skills`, and `~/.cursor/hooks.json`,
   `removeActivationHints` (`src/activation.ts`) and `runUninstall`
   (`src/uninstall.ts`) must track and remove every managed artifact. Consider a
   single manifest of what setup wrote rather than hard-coding paths in two
   places.

---

## 5. Prior art (working prototype)

A hand-built, smoke-tested prototype of capabilities 1–4 is archived at
`~/relay-prototype-2026-07-23/`. It is **reference material, not a spec** — read
it for concrete shapes, not final decisions. Paths:

- `cursor-agents/{pr-evidence,log-digger,slack-context,test-runner}.md` —
  Cursor subagents, `model: composer-2.5-fast`, `readonly: true`, "use
  proactively" descriptions (the descriptions are the load-bearing part).
- `claude-agents/{…}.md` — same four, `model: haiku`.
- `skills/delegate-cheap/SKILL.md` — the delegate-first policy + quality floor.
- `skills/checkpoint/SKILL.md` — the beads → ticket → `HANDOFF.md` checkpoint
  procedure.
- `hooks/context-watch.sh` — the watchdog: per-session tool-call counter under
  `$TMPDIR/cursor-context-watch`, threshold `CONTEXT_WATCH_THRESHOLD` (default
  120) with re-nudge `CONTEXT_WATCH_RENUDGE` (default 60), emits
  `{additional_context: …}`, fails open (exits 0 on any error, including a
  missing/blank session id). Reads real Cursor session ids
  (`.session_id // .conversation_id // .chat_id`).
- `hooks/hooks.json` — wires the script on `postToolUse` with a 5s timeout.
- `apex-repo/` — the **project-override** layer: `.cursor/agents/` and
  `claude-agents/` with the same four names but repo-specific instructions, plus
  `delegate-cheap.mdc` as an `alwaysApply` rule. Demonstrates that a repo can
  ship specializations that win over the global installs.

The hook there was smoke-tested: silent below threshold, fires at 120 calls,
throttles afterwards, reads real Cursor session ids.
