const YAML_HTML = `<span class="c"># router.yaml — the directive. share it like a dotfile.</span>
tiers:
  work:                                <span class="c"># first available backend wins</span>
    - { backend: cursor, model: glm-5.2 }
    - { backend: claude, model: sonnet-5 }
    - { backend: codex,  model: gpt-5.6-sol }
  deep:
    - { backend: cursor, model: fable-5-high }
lanes:
  - name: quickfix
    match: { verbs: [fix, rename, bump] }
    tier: work
    verify: [lint, test]               <span class="c"># the quality floor</span>
    write: stage                       <span class="c"># git diff = review</span>`;

export default function How() {
  return (
    <section id="how">
      <h2>
        <span className="prompt">$</span> how it works
      </h2>
      <div className="how-grid">
        <pre className="yaml" dangerouslySetInnerHTML={{ __html: YAML_HTML }} />
        <ol className="steps">
          <li>
            <b>route</b> — rules-first matching on the task; no model call needed to decide
          </li>
          <li>
            <b>run</b> — headless <code>cursor-agent</code> / <code>claude</code> /{" "}
            <code>codex</code> in your working tree, with a thin curated brief
          </li>
          <li>
            <b>verify</b> — your own lint &amp; tests decide, not vibes
          </li>
          <li>
            <b>widen → escalate</b> — thin briefs self-heal; frontier models are the exception
            path
          </li>
          <li>
            <b>receipt</b> — <code>saved vs your baseline</code>, measured where the backend
            reports usage
          </li>
        </ol>
      </div>
      <p className="mcp-note">
        Two mouths, one brain: a human CLI and an MCP server. Register once with{" "}
        <code>relay setup</code>, then just say <code>"relay this: …"</code> to your agent — same
        as the activate section above.
      </p>
    </section>
  );
}
