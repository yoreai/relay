import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { SCRIPT, type CardRow } from "../data/script";

const TYPE_MS = 24;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Line =
  | { kind: "user"; text: string; typing: boolean }
  | { kind: "agent"; text: string }
  | { kind: "card"; lane: string; rows: CardRow[]; done: boolean };

type Entry =
  | { kind: "turn"; id: number; lines: Line[] }
  | { kind: "ticker"; id: number; text: string }
  | { kind: "final"; id: number };

function updateLastLine(entries: Entry[], turnId: number, updater: (line: Line) => Line): Entry[] {
  return entries.map((entry) => {
    if (entry.kind !== "turn" || entry.id !== turnId) return entry;
    const lines = entry.lines.slice();
    lines[lines.length - 1] = updater(lines[lines.length - 1]);
    return { ...entry, lines };
  });
}

export default function Terminal() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    let nextId = 0;

    const addEntry = (entry: Entry) => setEntries((prev) => [...prev, entry]);
    const appendLine = (turnId: number, line: Line) =>
      setEntries((prev) =>
        prev.map((entry) =>
          entry.kind === "turn" && entry.id === turnId ? { ...entry, lines: [...entry.lines, line] } : entry,
        ),
      );

    async function typeUser(turnId: number, text: string) {
      appendLine(turnId, { kind: "user", text: "", typing: true });
      let typed = "";
      for (const ch of text) {
        if (!mounted) return;
        typed += ch;
        const snapshot = typed;
        setEntries((prev) => updateLastLine(prev, turnId, (line) => (line.kind === "user" ? { ...line, text: snapshot } : line)));
        await sleep(TYPE_MS + Math.random() * 18);
      }
      await sleep(500);
      if (!mounted) return;
      setEntries((prev) => updateLastLine(prev, turnId, (line) => (line.kind === "user" ? { ...line, typing: false } : line)));
    }

    async function showAgent(turnId: number, text: string) {
      appendLine(turnId, { kind: "agent", text });
      await sleep(650);
    }

    async function showCard(turnId: number, card: { lane: string; rows: CardRow[] }) {
      appendLine(turnId, { kind: "card", lane: card.lane, rows: [], done: false });
      await sleep(600);
      for (let i = 0; i < card.rows.length; i++) {
        if (!mounted) return;
        const revealed = card.rows.slice(0, i + 1);
        setEntries((prev) => updateLastLine(prev, turnId, (line) => (line.kind === "card" ? { ...line, rows: revealed } : line)));
        await sleep(700);
      }
      if (!mounted) return;
      setEntries((prev) => updateLastLine(prev, turnId, (line) => (line.kind === "card" ? { ...line, done: true } : line)));
      await sleep(400);
    }

    async function run() {
      while (mounted) {
        setEntries([]);
        for (const step of SCRIPT) {
          if (!mounted) return;
          if ("ticker" in step) {
            addEntry({ kind: "ticker", id: nextId++, text: step.ticker });
            continue;
          }
          const turnId = nextId++;
          addEntry({ kind: "turn", id: turnId, lines: [] });
          for (const item of step.turn) {
            if (!mounted) return;
            if (item.u) await typeUser(turnId, item.u);
            else if (item.a) await showAgent(turnId, item.a);
            else if (item.card) await showCard(turnId, item.card);
          }
          await sleep(700);
        }
        if (!mounted) return;
        addEntry({ kind: "final", id: nextId++ });
        await sleep(7000);
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [entries]);

  return (
    <div className="term" id="terminal" aria-label="agent session demo">
      <div className="term-bar">
        <span className="dot red" />
        <span className="dot yellow" />
        <span className="dot green" />
        <span className="term-title">agent</span>
      </div>
      <div className="term-body" id="term-body" ref={bodyRef}>
        {entries.map((entry) => {
          if (entry.kind === "ticker") {
            return (
              <motion.div key={entry.id} className="ticker" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {entry.text}
              </motion.div>
            );
          }
          if (entry.kind === "final") {
            return (
              <div key={entry.id} className="msg user">
                <span className="ps">❯ </span>
                <span className="caret" />
              </div>
            );
          }
          return (
            <div key={entry.id} className="turn">
              {entry.lines.map((line, i) => {
                if (line.kind === "user") {
                  return (
                    <div key={i} className="msg user">
                      <span className="ps">❯ </span>
                      <span>{line.text}</span>
                      {line.typing && <span className="caret" />}
                    </div>
                  );
                }
                if (line.kind === "agent") {
                  return (
                    <motion.div key={i} className="msg agent" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <span className="bullet">● </span>
                      <span>{line.text}</span>
                    </motion.div>
                  );
                }
                return (
                  <motion.div key={i} className="card" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="card-head">
                      <span className="glyph">⚡</span>
                      <span className="name">relay</span>
                      <span className="lane">{line.lane}</span>
                      <span className={line.done ? "state done" : "state"}>{line.done ? "done ✓" : "running…"}</span>
                    </div>
                    {line.rows.map((row, ri) => (
                      <div key={ri} className={`card-row ${row.c}`}>
                        {row.t}
                      </div>
                    ))}
                  </motion.div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="term-foot">
        <span>
          any agent, same pattern — relay picks the sub-agent · <b>measured</b> receipts are from real runs
        </span>
      </div>
    </div>
  );
}
