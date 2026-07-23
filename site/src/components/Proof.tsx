export default function Proof() {
  return (
    <section id="proof">
      <h2>
        <span className="prompt">$</span> proof — small, open, honest
      </h2>
      <p className="method">
        We ran six mechanical bug-fix tasks twice with identical prompts: relay's normal routing
        (grok-4.5, workhorse class) vs the same lane forced to the frontier model (fable-5-high).{" "}
        <b>Grading is each repo's own deterministic tests — no LLM judging.</b> Costs use list
        prices; this run predates measured token reporting (relay now reads exact usage from the
        CLI), so both arms used the same byte-estimator — absolute dollars are approximate, the{" "}
        <em>ratio</em> is apples-to-apples.{" "}
        <a href="https://github.com/yoreai/relay/tree/main/bench">
          Method, fixtures &amp; raw results are in the repo
        </a>{" "}
        — reproduce it yourself.
      </p>

      <div className="bench-summary">
        <div className="stat">
          <b>6/6 = 6/6</b>
          <span>tests passed, both arms — quality parity</span>
        </div>
        <div className="stat">
          <b>5.2×</b>
          <span>median cost reduction (2.2–8.7×)</span>
        </div>
        <div className="stat">
          <b>3–6×</b>
          <span>faster on clean frontier runs — often far more*</span>
        </div>
      </div>

      <div className="bench-grid">
        <div className="bench-row bench-head">
          <span>task</span>
          <span>routed · grok-4.5</span>
          <span>frontier · fable-5-high</span>
          <span>ratio</span>
        </div>
        <div className="bench-row">
          <span>brackets</span>
          <span className="pass">✓ $0.073 · 47s</span>
          <span className="pass">✓ $0.379 · 131s</span>
          <span className="ratio">5.2×</span>
        </div>
        <div className="bench-row">
          <span>clamp</span>
          <span className="pass">✓ $0.064 · 21s</span>
          <span className="pass">✓ $0.240 · 708s*</span>
          <span className="ratio">3.7×</span>
        </div>
        <div className="bench-row">
          <span>csvline</span>
          <span className="pass">✓ $0.060 · 33s</span>
          <span className="pass">✓ $0.313 · 683s*</span>
          <span className="ratio">5.2×</span>
        </div>
        <div className="bench-row">
          <span>duration</span>
          <span className="pass">✓ $0.049 · 19s</span>
          <span className="pass">✓ $0.108 · 1258s*</span>
          <span className="ratio">2.2×</span>
        </div>
        <div className="bench-row">
          <span>paginate</span>
          <span className="pass">✓ $0.037 · 16s</span>
          <span className="pass">✓ $0.306 · 102s</span>
          <span className="ratio">8.2×</span>
        </div>
        <div className="bench-row">
          <span>slugify</span>
          <span className="pass">✓ $0.053 · 18s</span>
          <span className="pass">✓ $0.463 · 791s*</span>
          <span className="ratio">8.7×</span>
        </div>
      </div>

      <p className="caveats">
        What we claim: on mechanical, verifiable work, routed cheap models pass the same tests at
        a fraction of the cost — and escalation costs are charged to relay's side when they
        happen. What we don't claim: that cheap models match frontier on hard reasoning — relay
        routes those to frontier <em>on purpose</em>. N is small and disclosed; this is a receipt,
        not a leaderboard. *Frontier runs marked with an asterisk stalled past relay's 10-minute
        cap and passed on retry; times are end-to-end. Run date: 2026-07-21.
      </p>
    </section>
  );
}
