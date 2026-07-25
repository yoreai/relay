# Security Policy

Relay runs AI coding CLIs headlessly in your repository, executes your repo's own
lint/test commands, and keeps a local run log. That makes its security posture part of
its contract with you, so please report problems — we'd much rather hear it early.

## Reporting a vulnerability

**Use GitHub's private vulnerability reporting:**
[**Report a vulnerability →**](https://github.com/yoreai/relay/security/advisories/new)

That opens a private advisory only maintainers can see. Please do **not** open a public
issue for a security problem first.

What helps most:

- what an attacker controls (a repo? a config file? a model's output?)
- the smallest reproduction you can manage, and the relay version (`relay --version`)
- what you got: file access, command execution, credential exposure, something else

You'll get an acknowledgement within **3 days** and an assessment within **7**. This is
an independent personal project, not a staffed product — fixes ship as fast as one
maintainer can manage, and you'll be credited in `CHANGELOG.md` unless you'd rather not be.

## In scope

- **Permission-posture escapes** — anything that gets a worker more authority than the
  user's `router.yaml` grants. Read-only lanes must not write; a lane without
  `autonomy: full` must not get command-approval bypass flags
- **Command injection** through data relay reads: catalog, directive, `.relay.yaml`,
  briefs, backend output
- **Credential or data exposure** — leaking environment secrets into a worker or a
  verify command, or exposing the local run log / memory notes to other users
- **A repo controlling relay's behavior on a machine that merely cloned it**

## Known limits, not vulnerabilities

These are documented in the README's [Honest limits](./README.md#honest-limits) and are
design boundaries rather than bugs:

- **A worker reads the repo's `AGENTS.md`/`CLAUDE.md`, like any coding agent would.**
  Prompt injection from a repo you deliberately pointed a worker at is bounded by the
  safe-by-default posture, not eliminated. Don't point a worker at a repo you wouldn't
  run `npm test` in
- **Verify commands run your repo's toolchain.** Conventional detected commands
  (`npm test`, `pytest`) run without a prompt; repo-*committed* command strings require a
  one-time hash-pinned `relay trust` approval. An approved command running is working as
  designed
- **`autonomy: full` does exactly what it says.** If a user writes it into their own
  router.yaml, the worker gets unattended command execution
- **Backend CLIs own their own sandboxing and auth.** Relay stores no credentials and
  never passes `--dangerously-skip-permissions`; what Cursor or Claude Code allowlists is
  their configuration

## Supported versions

The latest released version gets fixes. Relay ships as a single compiled binary, so
upgrading is `brew upgrade relay` (then reload your editor so a stale MCP server process
isn't still serving the old build).
