type Cell = { model: string; inP: number; outP: number; hot?: boolean };

// Starter directive resolved per single-CLI machine (defaults/router.yaml,
// catalog 2026-07-23). With several CLIs installed the first candidate in
// router.yaml wins — the starter policy lists cursor first in every tier.
const ROWS: { tier: string; lanes: string; cursor: Cell; claude: Cell; codex: Cell }[] = [
  {
    tier: "nano",
    lanes: "status · summarize · watch",
    cursor: { model: "gpt-5.6-luna", inP: 1.0, outP: 6.0 },
    claude: { model: "haiku-4.5", inP: 0.8, outP: 4.0 },
    codex: { model: "gpt-5.6-luna", inP: 1.0, outP: 6.0 },
  },
  {
    tier: "cheap",
    lanes: "bulk mechanical edits",
    cursor: { model: "glm-5.2", inP: 1.4, outP: 4.4 },
    claude: { model: "haiku-4.5", inP: 0.8, outP: 4.0 },
    codex: { model: "gpt-5.6-luna", inP: 1.0, outP: 6.0 },
  },
  {
    tier: "work",
    lanes: "quickfix · build — the default",
    cursor: { model: "glm-5.2", inP: 1.4, outP: 4.4, hot: true },
    claude: { model: "sonnet-5", inP: 3.0, outP: 15.0 },
    codex: { model: "gpt-5.6-sol", inP: 5.0, outP: 30.0 },
  },
  {
    tier: "fast",
    lanes: "latency-sensitive",
    cursor: { model: "grok-4.5-fast", inP: 4.0, outP: 18.0 },
    claude: { model: "sonnet-5", inP: 3.0, outP: 15.0 },
    codex: { model: "gpt-5.6-luna", inP: 1.0, outP: 6.0 },
  },
  {
    tier: "review",
    lanes: "diagnose · root-cause · audit",
    cursor: { model: "opus-4.8-high", inP: 5.0, outP: 25.0 },
    claude: { model: "opus-4.8-high", inP: 5.0, outP: 25.0 },
    codex: { model: "gpt-5.6-sol", inP: 5.0, outP: 30.0 },
  },
  {
    tier: "deep",
    lanes: "escalation ceiling",
    cursor: { model: "fable-5-high", inP: 10.0, outP: 50.0 },
    claude: { model: "fable-5-high", inP: 10.0, outP: 50.0 },
    codex: { model: "gpt-5.6-sol", inP: 5.0, outP: 30.0 },
  },
];

// shade = output price per MTok: green ≤ $6, none ≤ $18, amber ≤ $30, red above
function heatClass(outP: number): string {
  if (outP <= 6) return "heat-low";
  if (outP <= 18) return "";
  if (outP <= 30) return "heat-mid";
  return "heat-high";
}

function MCell({ cell, col }: { cell: Cell; col: string }) {
  return (
    <span className={`m-cell ${heatClass(cell.outP)}${cell.hot ? " m-new" : ""}`}>
      <i className="m-col">{col}</i>
      <code>{cell.model}</code>
      <em>
        ${cell.inP.toFixed(2)} / ${cell.outP.toFixed(2)}
      </em>
      {cell.hot && <b className="m-tag">new default</b>}
    </span>
  );
}

export default function Matrix() {
  return (
    <section id="matrix">
      <h2>
        <span className="prompt">$</span> the matrix — which model your task lands on
      </h2>
      <p className="method">
        Row = the quality tier a lane demands. Column = the agent CLI on your machine —
        every tier resolves even with a single CLI. Prices are $/MTok in / out; tinted
        cells cost more. Have more than one CLI? The first candidate in your{" "}
        <code>router.yaml</code> wins — the starter policy lists Cursor first because it
        fronts every model. The order is yours to change.
      </p>
      <div className="matrix-grid">
        <div className="m-row m-head">
          <span>tier</span>
          <span>Cursor</span>
          <span>Claude Code</span>
          <span>Codex</span>
        </div>
        {ROWS.map((r) => (
          <div className="m-row" key={r.tier}>
            <span className="m-tier">
              <code>{r.tier}</code>
              <em>{r.lanes}</em>
            </span>
            <MCell cell={r.cursor} col="Cursor" />
            <MCell cell={r.claude} col="Claude Code" />
            <MCell cell={r.codex} col="Codex" />
          </div>
        ))}
      </div>
      <p className="sub">
        <span className="pass">glm-5.2</span> promoted to the work tier 2026-07-23 — 62.1
        SWE-bench Pro (open-weights leader) at $1.40/$4.40, ~35% cheaper than the previous
        default, same quality class. Quality floor unchanged: your own lint &amp; tests, with
        escalation to review/deep on failure.
      </p>
    </section>
  );
}
