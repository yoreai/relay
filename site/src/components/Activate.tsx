import CopyButton from "./CopyButton";

export default function Activate() {
  return (
    <section id="activate">
      <h2>
        <span className="prompt">$</span> activate
      </h2>
      <p className="method">
        <code>relay setup</code> registers the MCP tools and drops a one-block delegation hint
        into each agent so "relay this" reliably hands off. Nothing for you to configure —
        and <code>relay uninstall</code> removes exactly what setup added.
      </p>
      <div className="install-steps">
        <div className="step">
          <span className="n">1</span>
          <code>brew install yoreai/tap/relay</code>
          <CopyButton text="brew install yoreai/tap/relay" />
        </div>
        <div className="step">
          <span className="n">2</span>
          <code>relay setup</code>
          <CopyButton text="relay setup" />
        </div>
        <div className="step">
          <span className="n">3</span>
          <span className="note">then tell your agent things like:</span>
        </div>
      </div>
      <div className="prompt-wrap">
        <pre className="prompt-box" id="activate-prompt">{`"relay this: fix the flaky retry test"
"use relay to bump the deps and clean up lint"
"relay the rename, you review the diff"`}</pre>
        <CopyButton text="relay this: fix the flaky retry test" />
      </div>
      <p className="sub">
        Cursor · Claude Code · Codex — same MCP, any agent. Built-in recursion guard: relay
        workers can't re-delegate to relay.
      </p>
    </section>
  );
}
