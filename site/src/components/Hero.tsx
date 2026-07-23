import CopyButton from "./CopyButton";

export default function Hero() {
  return (
    <div className="hero-copy">
      <img className="hero-mark" src="/favicon.svg" alt="relay" width="64" height="64" />
      <h1>
        route the work.
        <br />
        keep the quality.
        <br />
        <em>keep the money.</em>
      </h1>
      <p className="lede">
        Your agents run everything through a frontier model — including the
        70% of work a mid-tier model does just as well. <b>relay</b> is the
        routing agent under any surface: it sends each task to the{" "}
        <em>cheapest model that clears its quality bar</em>, verifies the
        result, escalates only on failure, and hands you a receipt.
      </p>
      <div className="install-line">
        <code id="install-cmd">brew install yoreai/tap/relay</code>
        <CopyButton text="brew install yoreai/tap/relay" />
      </div>
      <p className="sub">
        macOS &amp; Linux · local harness · Apache-2.0 · no accounts · no telemetry · no stored credentials
      </p>
    </div>
  );
}
