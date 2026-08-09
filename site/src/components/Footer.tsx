export default function Footer() {
  return (
    <footer>
      <span>© 2026 YoreAI · Apache-2.0</span>
      <span>
        <a href="https://relayagent.dev">relayagent.dev</a> ·{" "}
        <a href="https://github.com/yoreai/relay">github</a>
      </span>
      <span>
        <code>brew install yoreai/tap/relay</code>
      </span>
      <span style={{ flexBasis: "100%", fontSize: 12, opacity: 0.7 }}>
        This page counts visits with Vercel Web Analytics — cookieless, no cross-site tracking.
        That's the website only: the <code>relay</code> binary itself still reports nothing, to us
        or anyone else. See <a href="#trust">trust</a>.
      </span>
    </footer>
  );
}
