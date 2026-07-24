const DIGEST_HTML = `<span class="c"># relay recall — ~/work/payments-api</span>
on branch feat/webhook-retries · 3 files dirty

<span class="c">## recent commits</span>
- 9f2c1ab · 2 hours ago · retry webhook deliveries with backoff
- 4be07d3 · yesterday · add idempotency keys to charge intents

<span class="c">## recent relay work</span>
- ok · quickfix/composer-2.5 · 2 file(s) (1h ago)
- FAILED · build/sonnet-5 (3h ago)
- open threads: 1 failed run may need a retry or human look

<span class="c">## notes (deposited by past sessions)</span>
- [decision] retries use cursor-based tokens, not offsets (1h ago)
- [watchout] staging replays events on deploy (1d ago)

<span class="c">## recent claude code session (2h ago)</span>
- "why is the retry test flaky when idempotency keys collide?"

<span class="c">## recent cursor session (25m ago)</span>
- "relay this: add jitter to the backoff"`;

export default function Memory() {
  return (
    <section id="memory">
      <h2>
        <span className="prompt">$</span> cross-agent memory
      </h2>
      <p className="lede section-lede">
        The reason people hold onto thousand-turn sessions is that starting fresh means
        re-explaining. So every extra turn re-sends a bloated context at frontier prices —
        the exact bill relay exists to cut. <b>relay remembers instead</b>, per repo, so a
        brand-new thread costs almost nothing and still knows where you were.
      </p>
      <div className="how-grid">
        <pre className="yaml" dangerouslySetInnerHTML={{ __html: DIGEST_HTML }} />
        <div>
          <ol className="steps">
            <li>
              <b>ask normally</b> — say <em>"where were we?"</em> in a fresh thread and your
              agent calls <code>relay_recall</code>. No hooks, no second tool to install
            </li>
            <li>
              <b>memory follows the repo, not the tool</b> — ask in Cursor about work you did
              in Claude Code. It's keyed to your git root, so every agent on the machine reads
              and writes the same memory
            </li>
            <li>
              <b>it works before you delegate anything</b> — the git layer means recall is
              useful on day one, even if you never route a single task through relay
            </li>
            <li>
              <b>bank a decision</b> — <code>relay_remember</code> keeps one durable line
              (<code>decision</code>, <code>todo</code>, <code>context</code>,{" "}
              <code>watchout</code>) that outlives the chat that produced it
            </li>
          </ol>
          <p className="honest">
            Four local layers — git activity, delegated runs, deposited notes, and your recent
            asks across Cursor / Claude Code / Codex — capped to a few KB and ordered newest
            first. All read from files already on your disk; nothing is uploaded, and{" "}
            <code>relay uninstall --purge</code> deletes it. It's an honest digest of what
            matters, not a transcript of everything.
          </p>
        </div>
      </div>
    </section>
  );
}
