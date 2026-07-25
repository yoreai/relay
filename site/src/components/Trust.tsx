export default function Trust() {
  return (
    <section id="trust">
      <h2>
        <span className="prompt">$</span> trust — local harness, least privilege
      </h2>
      <p className="method">
        relay is a small <b>local agent harness</b>. It runs on your machine, shells out to CLIs
        you already signed into, and writes receipts next to your repo. Your tasks, code, and
        credentials never go to a relay server — there isn't one.
      </p>
      <div className="cols trust-cols">
        <div>
          <h3>nothing phones home</h3>
          <p>
            No accounts. No telemetry. No stored API keys. We don't receive your prompts, diffs,
            or savings data. If the network is off, routing still works from the embedded
            catalog.
          </p>
        </div>
        <div>
          <h3>updates are pull-only</h3>
          <p>
            Model prices and classes live in a public catalog on GitHub.{" "}
            <code>relay update</code> (or <code>relay update --check</code>) <em>downloads</em>{" "}
            that file and the latest release tag — it never uploads your machine, your repos, or
            your usage. Stale catalog? You'll see “update available.” Your{" "}
            <code>router.yaml</code> stays yours until you run <code>relay advise --apply</code>.
          </p>
        </div>
        <div>
          <h3>you own the pipe</h3>
          <p>
            Auth stays with Cursor / Claude / Codex / …. relay only invokes binaries already on
            your <code>PATH</code>. Open source, single binary, Apache-2.0 — read the loop if you
            want.
          </p>
        </div>
      </div>

      <p className="method" style={{ marginTop: 34 }}>
        The other half of trust is <b>blast radius</b> — what a worker can actually do once it's
        running in your repo. relay keeps that deliberately small, and says so out loud rather
        than making you read the source.
      </p>
      <div className="cols trust-cols">
        <div>
          <h3>sandboxed unless you say otherwise</h3>
          <p>
            Read-only lanes are <em>enforced</em> read-only, not asked nicely. Write lanes edit
            files but their shell commands stay inside the CLI's sandbox — relay never passes{" "}
            <code>--force</code> unless your own <code>router.yaml</code> sets{" "}
            <code>autonomy: full</code> on that lane. Edits land as ordinary uncommitted changes,
            so git stays the review surface.
          </p>
        </div>
        <div>
          <h3>a repo you cloned isn't your policy</h3>
          <p>
            A repo can ship a <code>.relay/router.yaml</code>, and it applies only if you have no
            config of your own. The two settings that are permission <em>grants</em> —{" "}
            <code>autonomy: full</code> and <code>write: worktree</code>, which spends your git
            credentials — are ignored from a repo file and honored only from your own. relay tells
            you when it clamps one.
          </p>
        </div>
        <div>
          <h3>repo-authored commands need a yes</h3>
          <p>
            Conventional toolchain commands (<code>npm test</code>, <code>pytest</code>) just run.
            A command a repo spells out in its <em>own</em> config is arbitrary code, so it needs a
            one-time <code>relay trust</code> — pinned to the exact string, re-required if it
            changes — and verify runs with a minimal environment rather than your whole shell.
          </p>
        </div>
      </div>
      <p className="caveats">
        What we don't pretend: a worker still reads the repo's <code>AGENTS.md</code> /{" "}
        <code>CLAUDE.md</code> like any coding agent would, and the sandbox boundaries themselves
        belong to Cursor / Claude / Codex, not to relay. <em>Treat a repo you wouldn't run</em>{" "}
        <code>npm test</code> <em>in as a repo you shouldn't point a worker at.</em> Found
        something? <a href="https://github.com/yoreai/relay/blob/main/SECURITY.md">SECURITY.md</a>{" "}
        has a private reporting channel, and names the non-vulnerabilities too so you know where
        the design boundary sits.
      </p>
    </section>
  );
}
