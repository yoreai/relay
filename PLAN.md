# Relay — Design Record

> **One-line pitch:** an interface-independent task router *that remembers*. You (or your agent)
> hand Relay a task in plain English; a shareable *directive* decides which headless backend and
> model is the cheapest-and-fastest that can do it well; Relay runs it, verifies it, escalates only
> when needed, and prints a receipt for what it saved you. Per-repo memory (§5b) means a new
> session catches up in one call instead of re-explaining — which is what makes short sessions
> practical, and short sessions are half the savings.

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
6. **Git-native visibility:** sub-agent edits happen in the caller's working tree as ordinary
   **unstaged** changes — indistinguishable from the host agent's own edits (per-lane override:
   `worktree` → branch/patch for walkaway lanes). Host IDEs show them as normal file/source-control
   changes; git diff IS the review surface. Relay never stages or commits on the user's branch —
   auto-staging polluted the user's next commit (changed 2026-07-23, owner decision).
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
    **Tiers are the "latest model" abstraction** — users name a quality bar, not a version, so
    relay never needs to guess which release is newest (§6). New models arrive as catalog facts;
    `advise` proposes, the user accepts.
11. **`advise` reports two distinct things** (2026-07-24): a *cheaper* same-class model, or a
    *superseded* pick whose declared successor costs no more. The second case exists because a
    strictly-better model at an identical price saves nothing, so a price-only rule can never
    mention it — and that is exactly the shape of most flagship refreshes.
12. **Memory is core, not a plugin** (2026-07-23, owner-driven): two MCP tools + CLI twins, no
    hooks, no skills, no second database to install. Rationale and layer design in §5b.

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
        git (dirty tree) ◀│ 7 receipt + log       │           │ (plugin, optional)│
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
- **CLI humans** get relay's assembler: `git status`+diff, files named in the task, repo
  AGENTS.md. Hard token budget (default ~30k chars; configurable). *(An earlier draft sourced
  context from a `bd`/beads graph; that dependency was rejected — see §5b.)*

Small-context safety comes from the loop, not from stuffing context: **verify → widen → escalate**
(§3). Thin briefs self-heal mechanically; fat context is only paid for after thin context
demonstrably failed.

---

## 5. Savings accounting (the receipt)

- Directive has `baseline:` + prices. `defaults/catalog.yaml` is the authoritative price source;
  a user `prices.yaml` may still override per model. Catalog resolution: user config → whichever
  of (fetched, embedded) was reviewed most recently — an older fetched copy must never shadow a
  newer embedded one, or a release loses receipts for its own default models.
  After each run:
  `saved = tokens_in×(P_base_in−P_used_in) + tokens_out×(P_base_out−P_used_out)`.
- Print one quiet line, naming both sides so the counterfactual is auditable:
  `relay: ~$0.22 saved — glm-5.2 cost $0.02, baseline fable-5-high would've cost ~$0.24 [measured]`.
- `relay savings` → cumulative, split by lane/model, **measured vs estimated labeled per row.**
  cursor/claude/codex all report usage in their stream-json result events, so those are
  *measured* (shared parser: `parseStreamUsage`); byte-estimation is now only the fallback when a
  backend emits no usage at all. Cache-read tokens are priced separately — ignoring them was
  once a ~12x savings overstatement.
- Log every run to `runs.jsonl`: `{ts, lane, backend, model, tokens_in/out (or est),
  verify_result, escalations, saved_usd, task_hash}` — NO task text by default (privacy);
  `--log-tasks` opt-in.
- **Never fabricate precision.** If we can't price something, the receipt says so.

## 5b. Memory ("relay remembers") — design, added 2026-07-23

The long-session problem is relay's own problem restated: every extra turn
re-sends bloated context at frontier prices, but people keep sessions alive
because starting fresh means re-explaining. Memory removes that reason.

- **Two MCP tools, no hooks, no skills, no extra installs.** `relay_recall`
  returns a per-repo catch-up digest; `relay_remember` deposits a durable
  one-line note (decision / todo / context / watchout). Being plain MCP tools,
  they work identically in every host by construction and are testable by the
  eval suite like everything else. CLI twins: `relay recall` / `relay remember`.
- **Recall is layered residue, newest first, deterministic (no LLM pass):**
  1. *git* — branch, dirty files, recent commits, unreconciled `relay/*`
     branches. Works for users who never delegate: memory is useful **before**
     the routing habit forms.
  2. *relay runs* — `runs.jsonl` filtered by repo cwd; failed runs surface as
     open threads.
  3. *notes* — `~/.local/share/relay/memory/<repo-hash>.jsonl`, keyed by git
     root so any subdirectory recalls the same memory.
  4. *host sessions* — recent USER asks read best-effort from the hosts' own
     local session files (`~/.cursor/projects/...`, `~/.claude/projects/...`,
     `~/.codex/sessions/...`). Formats are undocumented; adapters degrade to
     empty on any parse failure and never block recall. relay's own worker
     prompts and auth probes are filtered out.
- **The digest protects context, it doesn't spend it:** hard cap (~6KB),
  recency-weighted, notes beyond the last 10 collapse to a count.
- **Honest claim, locked wording:** "relay wrote down everything that
  matters" — NOT "nothing is ever lost". A digest is a good summary, not the
  session.
- **Privacy:** all layers are local files; recall never uploads anything;
  `relay uninstall --purge` deletes the memory store.
- Deliberately rejected for now: beads/graph-db dependency (second install,
  schema we don't control — optional adapter later if demand appears), LLM
  distillation on the recall path (latency + cost on the hot path; may come
  later for the transcript layer), and host hooks (per-host fragility).

## 6. Backends — constraints

- Common interface: `run(brief, model, opts) → {output, filesChanged, usage?, exitCode}`.
- **Model ids must be pinned, never aliased.** Backends take a canonical catalog id and map it to
  a concrete CLI id (`opus-5` → `claude-opus-5`). Family aliases like `opus` are forbidden in
  these maps: they silently re-point when a new family member ships, so the run stops being the
  model the receipt priced. This is why relay does *not* offer "always use the latest in family"
  routing — the tier table is the intended abstraction, and `relay advise` is how new models
  arrive (with a human accepting the diff). Learned the hard way 2026-07-24.
- **cursor** — emits usage in its stream-json result event (as do claude/codex); parse it rather
  than estimating. Binary discovery: `cursor-agent` or `agent` on PATH (users alias it); make it
  configurable. Effort is encoded in the model id itself (`claude-opus-5-high`).
- **claude / codex** — DO emit usage in their result event. Respect user aliases; never pass
  `--dangerously-skip-permissions` ourselves — permission posture belongs to the user's own config.
  Codex additionally needs `tool_timeout_sec` + tool-approval keys set at setup time or it
  cancels MCP calls silently.
- **gemini / grok / kimi** — spec-driven generic CLI backend; adding a new agent CLI is one table
  entry. Mark `verified: false` until tested against a real install.
- **frankie adapter (separate package/dir)** — the "walkaway" backend for repos that have Frankie.
  **Core must build and test cleanly with this adapter absent.** This is the only sanctioned
  Abridge/Frankie surface; the core has zero such references (enforced by `AGENTS.md`).

---

## 7. Risks / honest caveats (tell the user, don't hide)

- **Fresh short sessions lose accumulated judgment** — mitigated by memory (§5b) plus brief
  quality, not by bigger contexts. Relay is only as smart as its briefs.
- **Memory is a digest, not a transcript** — recall can omit something that mattered. The
  wording never promises total recall, and the host-session layer is explicitly best-effort
  against undocumented file formats.
- **Cheap-model wrongness costs review cycles** — the verify/escalate ladder bounds it, but
  `done_means` quality is the real control. Push callers to write verifiable acceptance.
- **Model IDs/prices drift** — everything lives in directive/catalog data files; nothing hardcoded.
  Catalog updates reach installed relays via `relay update` with no release, so a new model is a
  data change. What *cannot* be data is a new backend id mapping — that ships with the binary.
- **Backend CLI flags drift** — adapters must feature-detect (`--help` probe or version gate),
  fail with actionable messages, never crash relay core.

---

## 8. Open questions for the owner

### Still open

1. Final public name check when open-sourcing widely (bare `relay` is fine for tap; revisit if it
   ever goes registry-global).
2. Should the frontier class require independently-verified benchmarks to enter? Vendor-only
   numbers put `kimi-k2.7-code` in frontier, where `advise` recommended it as a fable-5
   replacement on price alone (demoted 2026-07-24). — *Convention for now; not enforced by
   `check-catalog`.*
3. **A `[todo]` note has no close.** Notes are append-only, so a finished todo keeps showing up in
   `relay recall` until the last-10 cap ages it out; the only way to correct the record is to
   deposit a superseding note. Bounded, but it makes the digest slowly less trustworthy — which is
   the one thing memory cannot afford. Options: a `--resolve` flag matching an earlier note, an
   explicit note id, or letting `[todo]` notes expire faster than the rest.
4. Should `advise` surface a *newer sibling* a backend CLI offers but the catalog doesn't know
   about yet (e.g. by diffing `cursor-agent models`)? Would have caught opus-5 locally on day
   one, but family/version inference from arbitrary model strings is fragile. — *Deferred; the
   catalog + `supersedes` path covers it with a human in the loop.*

### Resolved

5. Classifier default: on or off? — *On, nano-tier (see `defaults/router.yaml`).*
6. Should `build`-lane worktree runs auto-open a PR when `gh` is present? — *Yes, draft PR on a
   `relay/*` branch, never auto-merged.*
7. Telemetry: none beyond local `runs.jsonl`? — *Yes — no telemetry, no phone-home (only
   pull-only catalog/release checks via `relay update`).*

---

*This is a design record, not a build handover. For the current build, read `src/`; for releases,
`CHANGELOG.md`; for install/use, `README.md`; for the maintenance playbook, `AGENTS.md`.*
