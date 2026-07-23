// The rider's view: install once, register once, then just talk to your
// agent. Each delegation renders as a tool card showing which sub-agent
// activates. Receipts labeled [measured] mirror real runs.

export type CardRowKind = "sub" | "ok" | "money" | "note";
export type CardRow = { c: CardRowKind; t: string };
export type Card = { lane: string; rows: CardRow[] };
export type TurnItem = { u?: string; a?: string; card?: Card };
export type ScriptStep =
  | { turn: TurnItem[] }
  | { ticker: string }
  | { shell: { cmd: string; out: string[] } };

export const SCRIPT: ScriptStep[] = [
  // one-time setup, so the loop reads start-to-finish
  { shell: { cmd: "brew install yoreai/tap/relay", out: ["✓ relay installed"] } },
  {
    shell: {
      cmd: "relay setup",
      out: ["✓ registered in Cursor · Claude Code · Codex", "· that's it — now just talk to your agent:"],
    },
  },
  {
    turn: [
      { u: "relay this: fix the flaky retry tests — I'm heading to a meeting" },
      { a: "mechanical — handing it to relay" },
      {
        card: {
          lane: "quickfix",
          rows: [
            { c: "sub", t: "▸ Cursor sub-agent · glm-5.2" },
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
      { u: "ask relay what changed while I was out" },
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
      { u: "use relay to bump the deps and clean up lint warnings" },
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
      { u: "relay: auth breaks on token refresh — find the root cause" },
      { a: "needs real judgment — relay routes it to frontier class" },
      {
        card: {
          lane: "review",
          rows: [
            { c: "sub", t: "▸ Cursor sub-agent · opus-4.8 (review tier)" },
            { c: "note", t: "hard problems get full power — routed there on purpose" },
          ],
        },
      },
    ],
  },
  { ticker: "~$1.24 saved · 29 verified runs · quality floor: your own tests" },
];
