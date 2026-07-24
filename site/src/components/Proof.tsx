export default function Proof() {
  return (
    <section id="proof">
      <h2>
        <span className="prompt">$</span> proof — small, open, honest
      </h2>
      <p className="method">
        We ran six mechanical bug-fix tasks twice with identical prompts: relay's normal routing
        (composer-2.5, workhorse class) vs the same lane forced to the <code>deep</code> tier
        (opus-5).{" "}
        <b>Grading is each repo's own deterministic tests — no LLM judging.</b> Every cost below is
        priced from tokens the CLI actually reported — 12 of 12 runs measured, none estimated — and
        the run pins the shipped starter policy into each fixture, so your machine's{" "}
        <code>router.yaml</code> can't quietly change what got benchmarked.{" "}
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
          <b>5.1×</b>
          <span>median cost reduction (4.9–8.8×)</span>
        </div>
        <div className="stat">
          <b>1.7×</b>
          <span>faster at the median — not every task*</span>
        </div>
      </div>

      <div className="bench-grid">
        <div className="bench-row bench-head">
          <span>task</span>
          <span>routed · composer-2.5</span>
          <span>deep tier · opus-5</span>
          <span>ratio</span>
        </div>
        <div className="bench-row">
          <span>brackets</span>
          <span className="pass">✓ $0.019 · 12s</span>
          <span className="pass">✓ $0.095 · 26s</span>
          <span className="ratio">4.9×</span>
        </div>
        <div className="bench-row">
          <span>clamp</span>
          <span className="pass">✓ $0.020 · 15s</span>
          <span className="pass">✓ $0.100 · 24s</span>
          <span className="ratio">5.1×</span>
        </div>
        <div className="bench-row">
          <span>csvline</span>
          <span className="pass">✓ $0.022 · 18s</span>
          <span className="pass">✓ $0.114 · 25s</span>
          <span className="ratio">5.1×</span>
        </div>
        <div className="bench-row">
          <span>duration</span>
          <span className="pass">✓ $0.020 · 55s*</span>
          <span className="pass">✓ $0.112 · 30s</span>
          <span className="ratio">5.6×</span>
        </div>
        <div className="bench-row">
          <span>paginate</span>
          <span className="pass">✓ $0.020 · 14s</span>
          <span className="pass">✓ $0.102 · 23s</span>
          <span className="ratio">5.1×</span>
        </div>
        <div className="bench-row">
          <span>slugify</span>
          <span className="pass">✓ $0.019 · 14s</span>
          <span className="pass">✓ $0.166 · 33s</span>
          <span className="ratio">8.8×</span>
        </div>
      </div>

      <p className="caveats">
        What we claim: on mechanical, verifiable work, routed cheap models pass the same tests at a
        fraction of the cost — and escalation costs are charged to relay's side when they happen.
        What we don't claim: that cheap models match frontier on hard reasoning — relay routes those
        to frontier <em>on purpose</em>. The comparison arm is opus-5 because that is the model
        relay's own <code>deep</code> tier escalates to; benchmarking against a pricier model relay
        would never pick would only flatter the ratio. N is small and disclosed; this is a receipt,
        not a leaderboard. *The cheap arm is usually quicker, but not always — on{" "}
        <code>duration</code> it took 55s against the frontier arm's 30s. Run date: 2026-07-24.
      </p>
    </section>
  );
}
