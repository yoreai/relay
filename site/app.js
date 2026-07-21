// Demo: the rider's view. You talk to your coding agent (any of them —
// Cursor, Claude Code, Codex); the agent quietly delegates mechanical work
// to relay over MCP; relay sub-routes to whichever CLI+model clears the
// quality bar cheapest, verifies with YOUR tests, and returns a receipt.
// Receipt lines mirror real measured runs from relay's own dogfooding.
const SCRIPT = [
  { r: "you", text: "the retry tests are flaky again — fix them, I'm jumping on a call" },
  { r: "agent", text: "mechanical fix — handing it to relay with a tight brief while I hold context" },
  { r: "tool", text: "relay_run · lane: quickfix" },
  { r: "relay", text: "routing → cursor CLI ⚡ grok-4.5 (workhorse class)" },
  { r: "relay", text: "verify → lint ✓ · your tests ✓ · edits staged in git" },
  { r: "receipt", text: "receipt: ~$0.48 saved vs frontier [measured]" },
  { r: "agent", text: "done — diff is staged for your review. I never dropped our design thread." },
  { r: "gap" },

  { r: "you", text: "what changed while I was out?" },
  { r: "agent", text: "status question — relay routes it to the cheapest reader" },
  { r: "tool", text: "relay_run · lane: status (read-only)" },
  { r: "relay", text: "routing → claude CLI ⚡ haiku (nano class)" },
  { r: "receipt", text: "receipt: ~$0.05 saved [measured]" },
  { r: "gap" },

  { r: "you", text: "why does auth break on token refresh? something deeper is wrong" },
  { r: "agent", text: "this one needs real judgment — no shortcuts" },
  { r: "tool", text: "relay_run · lane: review" },
  { r: "relay", text: "routing → opus-class model, full effort — hard problems keep frontier power" },
  { r: "relay", text: "savings come from everything else, never from your quality bar" },
  { r: "gap" },

  { r: "ticker", text: "session: ~$1.24 saved · 29 verified runs · quality floor: your own tests" },
];

const body = document.getElementById("term-body");
const TYPE_MS = 24;
const LINE_PAUSE = 520;
const CMD_PAUSE = 620;
const RESTART_PAUSE = 7000;

const ROLES = {
  you: { cls: "you", prefix: "you ▸ ", type: true },
  agent: { cls: "agent", prefix: "agent ▸ ", type: false },
  tool: { cls: "tool", prefix: "⚙ ", type: false },
  relay: { cls: "relay", prefix: "relay ▸ ", type: false },
  receipt: { cls: "money", prefix: "  ", type: false },
  ticker: { cls: "ticker", prefix: "", type: false },
};

function el(cls, text) {
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = text;
  return span;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function typeLine(role, text) {
  const line = document.createElement("div");
  line.className = `line ${role.cls}`;
  line.appendChild(el("prefix", role.prefix));
  const target = el("", "");
  line.appendChild(target);
  const caret = el("caret", "");
  body.appendChild(line);

  if (role.type) {
    line.appendChild(caret);
    for (const ch of text) {
      target.textContent += ch;
      await sleep(TYPE_MS + Math.random() * 20);
    }
    await sleep(CMD_PAUSE);
    caret.remove();
  } else {
    target.textContent = text;
    await sleep(LINE_PAUSE);
  }
}

async function run() {
  body.textContent = "";
  for (const step of SCRIPT) {
    if (step.r === "gap") {
      body.appendChild(document.createElement("br"));
      await sleep(320);
      continue;
    }
    await typeLine(ROLES[step.r], step.text);
    body.scrollTop = body.scrollHeight;
  }
  const line = document.createElement("div");
  line.className = "line you";
  line.appendChild(el("prefix", "you ▸ "));
  line.appendChild(el("caret", ""));
  body.appendChild(line);
  await sleep(RESTART_PAUSE);
  run();
}

for (const btn of document.querySelectorAll(".copy")) {
  btn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(btn.dataset.copy);
    const old = btn.textContent;
    btn.textContent = "copied";
    setTimeout(() => (btn.textContent = old), 1200);
  });
}

run();
