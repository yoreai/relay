/** Inlined so `bun build --compile` ships working defaults without loose files. */

export const EMBEDDED_ROUTER_YAML = `version: 1
baseline: opus-5
tiers:
  nano:
    - { backend: cursor, model: gpt-5.6-luna, effort: low }
    - { backend: claude, model: haiku-4.5 }
    - { backend: codex, model: gpt-5.6-luna }
    - { backend: gemini, model: gemini-3-flash }
    - { backend: opencode, model: gpt-5.6-luna }
  # composer-2.5 leads the workhorse tiers: 3rd on the independent Artificial
  # Analysis Coding Agent Index at ~1/10-1/60 the per-task cost of the two above
  # it, and cheaper than glm-5.2, which stays right behind it.
  cheap:
    - { backend: cursor, model: composer-2.5 }
    - { backend: cursor, model: glm-5.2 }
    - { backend: claude, model: haiku-4.5 }
    - { backend: gemini, model: gemini-3-flash }
    - { backend: codex, model: gpt-5.6-luna }
    - { backend: kimi, model: kimi-k2.7-code }
    - { backend: opencode, model: gemini-3-flash }
  work:
    - { backend: cursor, model: composer-2.5 }
    - { backend: cursor, model: glm-5.2 }
    - { backend: cursor, model: grok-4.5 }
    - { backend: claude, model: sonnet-5 }
    - { backend: codex, model: gpt-5.6-sol }
    - { backend: gemini, model: gemini-3.1-pro }
    - { backend: kimi, model: kimi-k2.7-code }
    - { backend: opencode, model: glm-5.2 }
  fast:
    - { backend: cursor, model: composer-2.5 }
    - { backend: cursor, model: grok-4.5-fast }
    - { backend: claude, model: sonnet-5 }
    - { backend: gemini, model: gemini-3-flash }
    - { backend: codex, model: gpt-5.6-luna }
    - { backend: kimi, model: kimi-k2.7-code-highspeed }
    - { backend: opencode, model: gemini-3-flash }
  review:
    - { backend: cursor, model: opus-5, effort: high }
    - { backend: claude, model: opus-5 }
    - { backend: codex, model: gpt-5.6-sol }
    - { backend: gemini, model: gemini-3.1-pro }
    - { backend: kimi, model: kimi-k3, effort: high }
    - { backend: opencode, model: opus-5 }
  # opus-5 leads deep: ~parity with fable-5 on coding benchmarks at half the
  # price. fable-5 stays as the \`baseline\` (the counterfactual you'd otherwise
  # have run) and behind opus-5 here for anyone who wants the top of the card.
  deep:
    - { backend: cursor, model: opus-5, effort: high }
    - { backend: claude, model: opus-5 }
    - { backend: cursor, model: fable-5-high }
    - { backend: claude, model: fable-5-high }
    - { backend: codex, model: gpt-5.6-sol }
    - { backend: gemini, model: gemini-3.1-pro }
    - { backend: kimi, model: kimi-k3, effort: max }
    - { backend: opencode, model: opus-5 }
lanes:
  - name: status
    match: { verbs: [status, summarize, watch, check, list, read] }
    tier: nano
    write: none
  - name: quickfix
    match: { verbs: [fix, rename, update, bump, add-test], max_files: 5 }
    tier: work
    verify: [lint, test]
    write: tree
  - name: build
    match: { verbs: [build, implement, feature], walkaway: true }
    tier: work
    write: worktree
  - name: review
    match: { verbs: [review, diagnose, root-cause, audit] }
    tier: review
    write: none
default_lane: quickfix
escalation:
  widen_after: 1
  escalate_after: 2
verify_commands:
  lint: "auto"
  test: "auto"
classifier:
  tier: nano
  enabled: true
# How many writing runs this repo may host at once. Only \`write: worktree\`
# lanes can reach more than one — a tree-editing lane still holds your working
# tree exclusively, because two runs in one tree corrupt each other's verify.
# Parallel runs are serialized at verify (one test suite at a time per repo),
# so raise this for independent tasks, not to make one task finish sooner.
max_parallel: 2
`;

// Prices are catalog facts (see EMBEDDED_CATALOG_YAML / defaults/catalog.yaml),
// which is what lets `relay update` correct them without a release. So this
// file deliberately lists NO models: anything under `models:` overrides the
// catalog permanently, and a shipped copy of the price table would freeze the
// numbers it duplicates. It exists for the one honest case — a user pinning a
// rate they actually negotiated — plus the byte-estimation fallback.
export const EMBEDDED_PRICES_YAML = `version: 1
models: {}
bytes_per_token: 4
`;

export const EMBEDDED_CATALOG_YAML = `version: 1
updated: "2026-07-27"
classes: [nano, cheap, workhorse, opus-class, frontier]
models:
  gpt-5.6-luna:
    class: nano
    in: 1.0
    out: 6.0
    cache_read: 0.10
    backends: [cursor, codex, opencode]
  gemini-3-flash:
    class: cheap
    fast: true
    in: 0.30
    out: 2.50
    backends: [gemini, cursor, opencode]
    backend_prices: { opencode: { in: 0.50, out: 3.0, cache_read: 0.05 } }
  haiku-4.5:
    class: cheap
    in: 0.80
    out: 4.0
    cache_read: 0.08
    backends: [claude, opencode]
    backend_prices: { opencode: { in: 1.0, out: 5.0, cache_read: 0.10 } }
  glm-5.2:
    class: workhorse
    in: 1.40
    out: 4.40
    cache_read: 0.26
    backends: [cursor, opencode]
  composer-2.5:
    # workhorse on independent evidence (reviewed 2026-07-24): 3rd on Artificial
    # Analysis's Coding Agent Index (62) behind only opus-4.7-max (66) and
    # gpt-5.5-xhigh (65), which cost ~10-60x more per task; 79.8 SWE-bench
    # Multilingual vs opus-4.7's 80.5, and a tie on Terminal-Bench v2 (69.3 vs
    # 69.4). Cheapest agent scoring above 60 on that index — which is exactly
    # what the workhorse tier is for. Caveat worth knowing: gpt-5.5 beats it by
    # ~13pp on Terminal-Bench, so shell-heavy work is not its strength.
    class: workhorse
    fast: true
    in: 0.90
    out: 3.60
    backends: [cursor]
  grok-4.5:
    class: workhorse
    in: 2.0
    out: 6.0
    cache_read: 0.50
    backends: [cursor, grok, opencode]
  grok-4.5-fast:
    class: workhorse
    fast: true
    in: 4.0
    out: 18.0
    backends: [cursor, grok]
  sonnet-5:
    class: workhorse
    in: 3.0
    out: 15.0
    cache_read: 0.30
    backends: [claude, cursor, opencode]
    backend_prices: { opencode: { in: 2.0, out: 10.0, cache_read: 0.20 } }
  gemini-3.1-pro:
    class: opus-class
    in: 2.50
    out: 15.0
    backends: [gemini, cursor, opencode]
    backend_prices: { opencode: { in: 2.0, out: 12.0, cache_read: 0.20 } }
  opus-4.8-high:
    class: opus-class
    in: 5.0
    out: 25.0
    cache_read: 0.50
    backends: [cursor, claude, opencode]
  gpt-5.6-sol:
    class: opus-class
    in: 5.0
    out: 30.0
    backends: [cursor, codex, opencode]
  opus-5:
    # frontier on evidence, not vibes (2026-07-24): within 0.5pp of fable-5 on
    # CursorBench 3.2 at max effort for ~half the cost per task, 3x the
    # next-best on ARC-AGI-3, and clears fable-5's OSWorld 2.0 peak on ~1/3 the
    # budget — at opus-4.8's unchanged rate card. Supersedes opus-4.8-high:
    # same price, strictly better, so nothing should route to 4.8 by choice.
    class: frontier
    in: 5.0
    out: 25.0
    cache_read: 0.50
    supersedes: [opus-4.8-high]
    backends: [cursor, claude, opencode]
  kimi-k2.7-code:
    # demoted frontier → workhorse 2026-07-24. It was the cheapest thing in the
    # frontier class, so advise kept proposing it as a fable-5 replacement for
    # the deep tier on price alone. The class never held up: every published
    # K2.7 number is a Moonshot-proprietary suite (no independent SWE-bench,
    # Terminal-Bench or LiveCodeBench results exist), and on Moonshot's OWN
    # table it trails opus-4.8 — our opus-class marker — on Kimi Code Bench v2
    # (62.0 vs 67.4), Program Bench (53.6 vs 63.8) and MCP Atlas (76.0 vs 81.3).
    # Below the opus-class marker means below opus-class. Revisit if audited
    # public-suite numbers land.
    # 2026-07-25: prices re-verified against models.dev (0.95/4.0, cache 0.19 —
    # was 1.0/4.0 flat). Reasoning is always on with nothing to tune: k3 is the
    # only kimi model with effort levels, and k2.6 the only one with a thinking
    # toggle (models.dev reasoning_options, 2026-07-26). The managed kimi-code service
    # serves it as alias kimi-code/kimi-for-coding; relay maps the canonical
    # id (see kimiModelId in src/backends/cli.ts). Supersedes k2.6: same rate
    # card, newer, code-specialized.
    class: workhorse
    in: 0.95
    out: 4.0
    cache_read: 0.19
    supersedes: [kimi-k2.6]
    backends: [cursor, kimi]
  kimi-k2.6:
    # open platform only (verified 2026-07-25): the managed kimi-code OAuth
    # service does not serve k2.6, so relay passes this id through — pin your
    # own provider alias (e.g. moonshotai/kimi-k2.6) in router.yaml. Boolean
    # thinking on/off, no effort levels (models.dev reasoning_options, 2026-07-26).
    class: workhorse
    in: 0.95
    out: 4.0
    cache_read: 0.16
    backends: [kimi]
  kimi-k2.7-code-highspeed:
    # the highspeed serving of k2.7-code at 2x the rate card (models.dev,
    # 2026-07-25). Same boolean thinking; managed alias
    # kimi-code/kimi-for-coding-highspeed. relay's fast-tier kimi candidate.
    class: workhorse
    fast: true
    in: 1.90
    out: 8.0
    cache_read: 0.38
    backends: [kimi]
  kimi-k3:
    # provisional opus-class (2026-07-25): Moonshot's flagship (1M ctx,
    # released 2026-07-16), but every published number is vendor-only — the
    # same evidence rule that demoted k2.7-code from frontier keeps this out
    # of frontier until independent suites land. The only kimi model with
    # effort levels, chosen per tier via \`effort:\`. relay sets
    # KIMI_MODEL_THINKING_EFFORT, which forces thinking.effort on the wire and
    # bypasses the alias's declared support_efforts — which matters, because the
    # managed kimi-code/k3 alias declares only "max". Wire values: low, medium,
    # high, xhigh, max (Kimi Code env-var docs, checked 2026-07-27).
    # Managed alias kimi-code/k3.
    class: opus-class
    in: 3.0
    out: 15.0
    cache_read: 0.30
    backends: [kimi]
  fable-5-high:
    # note: the claude API gates fable-5 behind data retention being enabled,
    # so \`claude --model claude-fable-5\` 400s on ZDR workspaces. relay pins the
    # model rather than silently substituting one — you get a clear error, and
    # the deep tier reaches opus-5 first anyway.
    class: frontier
    in: 10.0
    out: 50.0
    cache_read: 1.0
    backends: [cursor, claude, opencode]
`;

// Mirror of defaults/worker.md — the compiled binary cannot read the repo
// file, so both copies change together (guarded by tests/methodology.test.ts).
export const EMBEDDED_WORKER_MD = `# relay worker method
#
# Injected into every delegated worker, whichever CLI serves it, right after
# relay's safety guards (recursion, no-op, read-only — those live in code and
# cannot be edited away here). Override by creating ~/.config/relay/worker.md:
# your file replaces this one entirely, and an empty file turns the method
# text off. Everything above the first "## " heading is ignored.
#
# Keep it short. Every line is paid for on every run, long method prompts
# dilute the brief on cheap models, and a rule relay cannot check belongs
# nowhere — prefer rules that shape the diff and the reply over vibes.

## always
- Do exactly what the brief asks, nothing beyond it. No drive-by refactors,
  renames, or cleanup outside the goal.
- Read neighboring code first and match the repo's conventions — style,
  naming, test patterns — over your own defaults.
- Comment only non-obvious intent. Never narrate your change or restate what
  the code already says.
- Report honestly: quote failing output verbatim, and never claim a command
  ran, passed, or was verified unless you ran it and watched it.
- End your reply with exactly these four lines:
  SUMMARY: one line — what was done or found
  CHANGED: files touched, or "none"
  VERIFIED: commands you ran and their results, or "nothing run"
  RISKS: open concerns worth a human's eyes, or "none"

## write
- Smallest correct change: touch only what the goal requires, prefer editing
  existing code over adding files or abstractions, and add no dependency the
  brief did not name.
- Changed behavior needs a changed test when the repo has a test suite.
- Broken things you find but were not asked to fix go under RISKS, not into
  the diff.

## read
- Lead with the answer, then the evidence — name files and lines for every
  claim.
- Say "not found" or "unsure" plainly instead of padding, and state what you
  searched in one line.
- Stay under about 30 lines unless the brief asks for depth.
`;
