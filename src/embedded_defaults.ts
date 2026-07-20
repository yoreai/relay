/** Inlined so `bun build --compile` ships working defaults without loose files. */

export const EMBEDDED_ROUTER_YAML = `version: 1
baseline: fable-5-high
tiers:
  nano: { backend: cursor, model: gpt-5.6-luna, effort: low }
  cheap: { backend: cursor, model: glm-5.2 }
  work: { backend: cursor, model: grok-4.5 }
  fast: { backend: cursor, model: grok-4.5-fast }
  review: { backend: cursor, model: opus-4.8-high }
  deep: { backend: cursor, model: fable-5-high }
lanes:
  - name: status
    match: { verbs: [status, summarize, watch, check, list, read] }
    tier: nano
    write: none
  - name: quickfix
    match: { verbs: [fix, rename, update, bump, add-test], max_files: 5 }
    tier: work
    verify: [lint, test]
    write: stage
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
`;

export const EMBEDDED_PRICES_YAML = `version: 1
models:
  gpt-5.6-luna:
    in: 1.0
    out: 6.0
    cache_read: 0.10
  glm-5.2:
    in: 1.40
    out: 4.40
    cache_read: 0.26
  grok-4.5:
    in: 2.0
    out: 6.0
    cache_read: 0.50
  grok-4.5-fast:
    in: 4.0
    out: 18.0
  opus-4.8-high:
    in: 5.0
    out: 25.0
    cache_read: 0.50
  fable-5-high:
    in: 10.0
    out: 50.0
    cache_read: 1.0
  gpt-5.6-sol:
    in: 5.0
    out: 30.0
bytes_per_token: 4
`;
