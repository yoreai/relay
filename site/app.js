// The rider's view: you talk to your agent as usual; relay sub-routes
// underneath. Each delegation renders as a tool card showing which
// sub-agent activates. Receipts labeled [measured] mirror real runs.
const SCRIPT = [
  {
    turn: [
      { u: "fix the flaky retry tests — I'm heading to a meeting" },
      { a: "mechanical — delegating to relay" },
      {
        card: {
          lane: "quickfix",
          rows: [
            { c: "sub", t: "▸ Cursor sub-agent · grok-4.5" },
            { c: "ok", t: "✓ lint  ✓ your tests  · edits staged" },
            { c: "money", t: "~$0.48 saved vs frontier  [measured]" },
          ],
        },
      },
      { a: "done — diff staged for your review" },
    ],
  },
  {
    turn: [
      { u: "what changed while I was out?" },
      {
        card: {
          lane: "status",
          rows: [
            { c: "sub", t: "▸ Claude Code sub-agent · haiku" },
            { c: "money", t: "~$0.05 saved  [measured]" },
          ],
        },
      },
    ],
  },
  {
    turn: [
      { u: "bump the deps and clean up lint warnings" },
      {
        card: {
          lane: "quickfix",
          rows: [
            { c: "sub", t: "▸ Codex sub-agent · gpt-5.6-luna" },
            { c: "ok", t: "✓ lint  ✓ build  · edits staged" },
            { c: "money", t: "~$0.11 saved  [estimated]" },
          ],
        },
      },
    ],
  },
  {
    turn: [
      { u: "auth breaks on token refresh — find the root cause" },
      { a: "needs real judgment — routing to frontier class" },
      {
        card: {
          lane: "review",
          rows: [
            { c: "sub", t: "▸ Kimi sub-agent · kimi-k2.7 (frontier class)" },
            { c: "note", t: "full power for hard problems — still ~10× cheaper" },
          ],
        },
      },
    ],
  },
  { ticker: "~$1.24 saved · 29 verified runs · quality floor: your own tests" },
];

const body = document.getElementById("term-body");
const TYPE_MS = 24;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

async function typeUser(container, text) {
  const line = el("div", "msg user");
  line.appendChild(el("span", "ps", "❯ "));
  const target = el("span", "", "");
  line.appendChild(target);
  const caret = el("span", "caret", "");
  line.appendChild(caret);
  container.appendChild(line);
  for (const ch of text) {
    target.textContent += ch;
    body.scrollTop = body.scrollHeight;
    await sleep(TYPE_MS + Math.random() * 18);
  }
  await sleep(500);
  caret.remove();
}

async function showAgent(container, text) {
  const line = el("div", "msg agent");
  line.appendChild(el("span", "bullet", "● "));
  line.appendChild(el("span", "", text));
  container.appendChild(line);
  await sleep(650);
}

async function showCard(container, card) {
  const box = el("div", "card");
  const head = el("div", "card-head");
  head.appendChild(el("span", "glyph", "⚡"));
  head.appendChild(el("span", "name", "relay"));
  head.appendChild(el("span", "lane", card.lane));
  const state = el("span", "state", "running…");
  head.appendChild(state);
  box.appendChild(head);
  container.appendChild(box);
  await sleep(600);

  for (const row of card.rows) {
    box.appendChild(el("div", `card-row ${row.c}`, row.t));
    body.scrollTop = body.scrollHeight;
    await sleep(700);
  }
  state.textContent = "done ✓";
  state.classList.add("done");
  await sleep(400);
}

async function run() {
  body.textContent = "";
  for (const step of SCRIPT) {
    if (step.ticker) {
      body.appendChild(el("div", "ticker", step.ticker));
      body.scrollTop = body.scrollHeight;
      continue;
    }
    const turn = el("div", "turn");
    body.appendChild(turn);
    for (const item of step.turn) {
      if (item.u) await typeUser(turn, item.u);
      else if (item.a) await showAgent(turn, item.a);
      else if (item.card) await showCard(turn, item.card);
      body.scrollTop = body.scrollHeight;
    }
    await sleep(700);
  }
  const line = el("div", "msg user");
  line.appendChild(el("span", "ps", "❯ "));
  line.appendChild(el("span", "caret", ""));
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
  await sleep(7000);
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
