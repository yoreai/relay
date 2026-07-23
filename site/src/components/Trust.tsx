export default function Trust() {
  return (
    <section id="trust">
      <h2>
        <span className="prompt">$</span> trust — local harness
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
    </section>
  );
}
