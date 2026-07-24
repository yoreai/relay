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
            <b>Where this came from:</b> at a hackathon someone mentioned the $500 of model
            credits everyone had been handed, and the room joked they'd burn through it by
            lunch. My honest reaction was <em>"I'd burn $500 before I finish my morning
            coffee."</em> That was the moment — not because the credits mattered, but because
            nobody in that room could tell you which of those dollars bought better code and
            which just bought a frontier model doing a rename.
          </p>
          <p>
            Three things bothered me enough to build: there's no reason to run a frontier model
            on <em>everything</em>, but cheaping out wrecks quality; switching models by hand
            never actually happens, because half the time you don't know the scope of your own
            problem yet; and every auto-router I tried quietly picked the cheap model and let
            quality tank. The fix had to make the <em>right</em> choice the <em>default</em>{" "}
            choice, and prove it with your own tests.
          </p>
          <p>
            <b>Why I keep working on it:</b> it can help a lot of people save a lot of money
            without compromising quality — and that's not a trade, it's a measurement problem.
            The cheapest pathway and the best result are usually the same pathway, if something
            is checking the work. relay is that something. Open source, local-first, honest
            receipts.
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
