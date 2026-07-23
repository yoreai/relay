/** Inlined so `bun build --compile` ships working defaults without loose files. */

export const EMBEDDED_ROUTER_YAML = `version: 1
baseline: fable-5-high
tiers:
  nano:
    - { backend: cursor, model: gpt-5.6-luna, effort: low }
    - { backend: claude, model: haiku-4.5 }
    - { backend: codex, model: gpt-5.6-luna }
    - { backend: gemini, model: gemini-3-flash }
  cheap:
    - { backend: cursor, model: glm-5.2 }
    - { backend: claude, model: haiku-4.5 }
    - { backend: gemini, model: gemini-3-flash }
    - { backend: codex, model: gpt-5.6-luna }
  work:
    - { backend: cursor, model: glm-5.2 }
    - { backend: cursor, model: grok-4.5 }
    - { backend: claude, model: sonnet-5 }
    - { backend: codex, model: gpt-5.6-sol }
    - { backend: gemini, model: gemini-3.1-pro }
  fast:
    - { backend: cursor, model: grok-4.5-fast }
    - { backend: claude, model: sonnet-5 }
    - { backend: gemini, model: gemini-3-flash }
    - { backend: codex, model: gpt-5.6-luna }
  review:
    - { backend: cursor, model: opus-4.8-high }
    - { backend: claude, model: opus-4.8-high }
    - { backend: codex, model: gpt-5.6-sol }
    - { backend: gemini, model: gemini-3.1-pro }
  deep:
    - { backend: cursor, model: fable-5-high }
    - { backend: claude, model: fable-5-high }
    - { backend: codex, model: gpt-5.6-sol }
    - { backend: gemini, model: gemini-3.1-pro }
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
  sonnet-5:
    in: 3.0
    out: 15.0
    cache_read: 0.30
  haiku-4.5:
    in: 0.80
    out: 4.0
    cache_read: 0.08
bytes_per_token: 4
`;

export const EMBEDDED_CATALOG_YAML = `version: 1
updated: "2026-07-23"
classes: [nano, cheap, workhorse, opus-class, frontier]
models:
  gpt-5.6-luna:
    class: nano
    in: 1.0
    out: 6.0
    cache_read: 0.10
    backends: [cursor, codex]
  gemini-3-flash:
    class: cheap
    fast: true
    in: 0.30
    out: 2.50
    backends: [gemini, cursor]
  haiku-4.5:
    class: cheap
    in: 0.80
    out: 4.0
    cache_read: 0.08
    backends: [claude]
  glm-5.2:
    class: workhorse
    in: 1.40
    out: 4.40
    cache_read: 0.26
    backends: [cursor]
  composer-2.5:
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
    backends: [cursor, grok]
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
    backends: [claude, cursor]
  gemini-3.1-pro:
    class: opus-class
    in: 2.50
    out: 15.0
    backends: [gemini, cursor]
  opus-4.8-high:
    class: opus-class
    in: 5.0
    out: 25.0
    cache_read: 0.50
    backends: [cursor, claude]
  gpt-5.6-sol:
    class: opus-class
    in: 5.0
    out: 30.0
    backends: [cursor, codex]
  kimi-k2.7-code:
    class: frontier
    in: 1.0
    out: 4.0
    backends: [cursor, kimi]
  fable-5-high:
    class: frontier
    in: 10.0
    out: 50.0
    cache_read: 1.0
    backends: [cursor, claude]
`;
