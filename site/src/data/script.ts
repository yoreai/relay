// The rider's view: you talk to your agent as usual; relay sub-routes
// underneath. Each delegation renders as a tool card showing which
// sub-agent activates. Receipts labeled [measured] mirror real runs.

export type CardRowKind = "sub" | "ok" | "money" | "note";
export type CardRow = { c: CardRowKind; t: string };
export type Card = { lane: string; rows: CardRow[] };
export type TurnItem = { u?: string; a?: string; card?: Card };
export type ScriptStep = { turn: TurnItem[] } | { ticker: string };

export const SCRIPT: ScriptStep[] = [
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
            { c: "sub", t: "▸ Cursor sub-agent · opus-4.8 (review tier)" },
            { c: "note", t: "hard problems get full power — routed there on purpose" },
          ],
        },
      },
    ],
  },
  { ticker: "~$1.24 saved · 29 verified runs · quality floor: your own tests" },
];
