// Terminal demo: replays a real relay session (the receipt lines mirror
// actual dogfood runs — sonnet-5 fixing a failing test, verified by npm test).
const SCRIPT = [
  { type: "cmd", text: "brew install yoreai/tap/relay" },
  { type: "out", text: "🍺  relay 0.4.2: 4 files, 64.6MB, built in 2 seconds" },
  { type: "out", text: "Next step (one command):" },
  { type: "out", text: "  relay setup" },
  { type: "gap" },
  { type: "cmd", text: "relay setup" },
  { type: "ok", text: "✓ registered relay in ~/.cursor/mcp.json" },
  { type: "ok", text: "✓ registered relay in ~/.claude.json" },
  { type: "gap" },
  { type: "cmd", text: 'relay "fix the failing slugify tests in src/"' },
  { type: "out", text: "→ lane: quickfix · sonnet-5 · verify: lint+test ✓ · 1 file changed (staged)" },
  { type: "money", text: "relay: ~$0.02 saved (sonnet-5 vs fable-5-high) [measured]" },
  { type: "gap" },
  { type: "cmd", text: 'relay "summarize the last 3 commits"' },
  { type: "out", text: "→ lane: status · haiku-4.5 · verify: ✓ · read-only" },
  { type: "money", text: "relay: ~$0.05 saved (haiku-4.5 vs fable-5-high) [measured]" },
  { type: "gap" },
  { type: "cmd", text: "relay advise" },
  { type: "out", text: "  deep    fable-5-high → kimi-k2.7-code — ~91% cheaper, same frontier class" },
  { type: "out", text: "  work    grok-4.5 → composer-2.5 — ~48% cheaper, same workhorse class" },
  { type: "gap" },
  { type: "cmd", text: "relay savings" },
  { type: "money", text: "total saved: adds up while your agents work — receipts, not vibes" },
];

const body = document.getElementById("term-body");
const TYPE_MS = 26;
const LINE_PAUSE = 420;
const CMD_PAUSE = 700;
const RESTART_PAUSE = 6000;

function el(cls, text) {
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = text;
  return span;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function typeCommand(text) {
  const line = document.createElement("div");
  line.appendChild(el("ps1", "$ "));
  const target = el("", "");
  line.appendChild(target);
  const caret = el("caret", "");
  line.appendChild(caret);
  body.appendChild(line);
  for (const ch of text) {
    target.textContent += ch;
    await sleep(TYPE_MS + Math.random() * 22);
  }
  await sleep(CMD_PAUSE);
  caret.remove();
}

async function printLine(cls, text) {
  const line = document.createElement("div");
  line.appendChild(el(cls, text));
  body.appendChild(line);
  await sleep(LINE_PAUSE);
}

async function run() {
  body.textContent = "";
  for (const step of SCRIPT) {
    if (step.type === "gap") {
      body.appendChild(document.createElement("br"));
      await sleep(260);
    } else if (step.type === "cmd") {
      await typeCommand(step.text);
    } else {
      await printLine(step.type, step.text);
    }
    body.scrollTop = body.scrollHeight;
  }
  const line = document.createElement("div");
  line.appendChild(el("ps1", "$ "));
  line.appendChild(el("caret", ""));
  body.appendChild(line);
  await sleep(RESTART_PAUSE);
  run();
}

// copy buttons
for (const btn of document.querySelectorAll(".copy")) {
  btn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(btn.dataset.copy);
    const old = btn.textContent;
    btn.textContent = "copied";
    setTimeout(() => (btn.textContent = old), 1200);
  });
}

run();
