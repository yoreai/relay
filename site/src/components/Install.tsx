import CopyButton from "./CopyButton";

export default function Install() {
  return (
    <section id="install">
      <h2>
        <span className="prompt">$</span> install
      </h2>
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
          <span className="note">registers relay in Cursor / Claude Code — that's it</span>
        </div>
        <div className="step optional">
          <span className="n">+</span>
          <code>relay doctor · relay advise · relay savings</code>
          <span className="note">see your routing, get cheaper same-class swaps, watch the receipts add up</span>
        </div>
      </div>
      <p className="sub">
        Linux/CI:{" "}
        <code>curl -fsSL https://raw.githubusercontent.com/yoreai/relay/main/scripts/install.sh | bash</code>
      </p>
    </section>
  );
}
