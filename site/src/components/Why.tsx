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
            <code>work → review → deep</code>. Edits land <b>in your working tree</b>, exactly
            like your agent's own edits — nothing staged or committed for you. relay never commits
            unless a walkaway lane says so, and never touches your credentials: it drives the CLIs
            you already logged into.
          </p>
        </div>
        <div>
          <h3>start fresh — relay remembers</h3>
          <p>
            Long chats re-send their whole bloated context at frontier prices, every turn. relay
            gives you a way out: say <em>"where were we?"</em> in a brand-new thread and{" "}
            <code>relay_recall</code> catches the agent up from local residue. Memory is keyed to
            the <b>repo, not the tool</b> — so you can ask in Cursor about work you did in Claude
            Code. No re-explaining, no thousand-turn sessions.{" "}
            <a href="#memory">how memory works →</a>
          </p>
        </div>
      </div>
    </section>
  );
}
