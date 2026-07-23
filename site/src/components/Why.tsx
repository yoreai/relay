export default function Why() {
  return (
    <section id="why">
      <h2>
        <span className="prompt">$</span> why
      </h2>
      <div className="cols">
        <div>
          <h3>pay for judgment, not ceremony</h3>
          <p>
            Watchers polling dashboards, bulk renames, test fixes, status summaries — agents burn
            frontier tokens on work that doesn't need frontier judgment. On our{" "}
            <a href="#proof">open micro-benchmark</a>, routed models passed the{" "}
            <b>same tests as frontier at a median 5.2× lower cost</b>; on watcher-class load with
            cache-read pricing the projection is 10–20× (labeled as the estimate it is).
            <span className="honest">
              Every receipt says <code>measured</code> or <code>estimated</code> on it — nothing
              here is fabricated precision.
            </span>
          </p>
        </div>
        <div>
          <h3>your policy, not a black box</h3>
          <p>
            Auto-routers are opaque and change under you mid-session. relay's routing lives in{" "}
            <code>router.yaml</code> — a versioned, auditable, <em>shareable</em> file. Lanes map
            task shapes to quality tiers; tiers map to concrete models with fallbacks per backend.
            When the market moves, <code>relay advise</code> proposes cheaper same-class swaps as
            a git-visible diff. It never rewrites your policy behind your back.
          </p>
        </div>
        <div>
          <h3>quality first — enforced, not hoped</h3>
          <p>
            Cheap-first only works with a floor under it. Every edit lane runs your repo's own
            lint and tests; failure widens context, then bumps the tier:{" "}
            <code>work → review → deep</code>. Edits land <b>staged in git</b> — your diff is the
            review surface. relay never commits unless a lane says so, and never touches your
            credentials: it drives the CLIs you already logged into.
          </p>
        </div>
      </div>
    </section>
  );
}
