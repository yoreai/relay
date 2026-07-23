export default function Clis() {
  return (
    <section id="clis">
      <h2>
        <span className="prompt">$</span> backends — the CLIs relay drives
      </h2>
      <p className="method">
        relay never stores credentials. It shells out to the agent CLIs you already installed and
        signed into. First available backend in each tier wins — a Claude-only machine still
        routes every lane.
      </p>
      <div className="cli-grid">
        <div className="cli-row cli-head">
          <span>surface</span>
          <span>CLI</span>
          <span>status</span>
        </div>
        <div className="cli-row">
          <span>Cursor</span>
          <span>
            <code>cursor-agent</code>
          </span>
          <span className="pass">verified</span>
        </div>
        <div className="cli-row">
          <span>Claude Code</span>
          <span>
            <code>claude</code>
          </span>
          <span className="pass">verified</span>
        </div>
        <div className="cli-row">
          <span>Codex</span>
          <span>
            <code>codex</code>
          </span>
          <span className="pass">verified</span>
        </div>
        <div className="cli-row">
          <span>Gemini CLI</span>
          <span>
            <code>gemini</code>
          </span>
          <span className="exp">experimental</span>
        </div>
        <div className="cli-row">
          <span>Grok CLI</span>
          <span>
            <code>grok</code>
          </span>
          <span className="exp">experimental</span>
        </div>
        <div className="cli-row">
          <span>Kimi CLI</span>
          <span>
            <code>kimi</code>
          </span>
          <span className="exp">experimental</span>
        </div>
      </div>
    </section>
  );
}
