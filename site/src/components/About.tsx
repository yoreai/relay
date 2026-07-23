export default function About() {
  return (
    <section id="about">
      <h2>
        <span className="prompt">$</span> about
      </h2>
      <div className="about-grid">
        <div>
          <p>
            I'm <b>Yev</b> — founder of <a href="https://www.yoreai.com/">YoreAI</a>, AI
            researcher &amp; ML data scientist at Abridge, with roots in bioinformatics and
            applied data science (MDS, University of Pittsburgh). The through-line of my career,
            from genomics pipelines to healthcare AI, has always been the same thing:{" "}
            <em>build tools that help other people succeed.</em>
          </p>
          <p>
            relay exists because I got tired of watching agents — mine and everyone else's — pay
            frontier prices for mechanical work, and equally tired of the false trade where
            "cheap" means "wrong." The cheapest pathway and the best result are usually the same
            pathway, if something is checking the work. relay is that something. Open source,
            local-first, honest receipts.
          </p>
        </div>
        <div className="projects">
          <h3>open research tools</h3>
          <a className="project" href="https://github.com/yoreai/relay">
            <b>relay</b>
            <span>task router for AI agents — this page</span>
          </a>
          <a className="project" href="https://github.com/yoreai/aresadb">
            <b>aresadb</b>
            <span>embedded graph database with tiered storage, SQL queries &amp; Python bindings (Rust)</span>
          </a>
          <a className="project" href="https://github.com/yoreai">
            <b>more →</b>
            <span>github.com/yoreai</span>
          </a>
        </div>
      </div>
    </section>
  );
}
