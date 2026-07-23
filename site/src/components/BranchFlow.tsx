import { motion, useReducedMotion } from "framer-motion";

const AGENTS = [
  { id: "codex", label: "Codex", y: 50 },
  { id: "claude", label: "Claude Code", y: 130 },
  { id: "cursor", label: "Cursor", y: 210 },
  { id: "warp", label: "Warp", y: 290 },
];

const STAGES = [
  { id: "identify", label: "identify metrics", x: 560, time: 0.425 },
  { id: "route", label: "route to best backend", x: 690, time: 0.591 },
  { id: "verify", label: "verify", x: 820, time: 0.757 },
];

const RELAY = { x: 440, y: 170 };
const RESULT = { x: 960, y: 170 };
const AGENT_X = 70;
const CYCLE = 6.4;

const DIM = "#1f2a20";
const GREEN = "#4ade80";

export default function BranchFlow() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="branchflow">
      <svg
        viewBox="0 0 1000 340"
        className="branchflow-svg"
        role="img"
        aria-label="Diagram: Codex, Claude Code, Cursor, and Warp all route through relay, which identifies metrics, routes to the best backend, verifies the result, and returns a clean git diff."
      >
        {AGENTS.map((agent, i) => {
          const path = `M ${AGENT_X + 58} ${agent.y} C ${RELAY.x - 130} ${agent.y}, ${RELAY.x - 110} ${RELAY.y}, ${RELAY.x - 38} ${RELAY.y}`;
          const delay = i * (CYCLE / AGENTS.length) * 0.5;
          return (
            <motion.path
              key={agent.id}
              d={path}
              className="bf-branch"
              fill="none"
              strokeWidth={2}
              initial={false}
              animate={
                reduceMotion
                  ? { stroke: GREEN, opacity: 1 }
                  : { stroke: [DIM, GREEN, DIM], opacity: [0.5, 1, 0.5] }
              }
              transition={
                reduceMotion
                  ? undefined
                  : { duration: CYCLE, repeat: Infinity, ease: "easeInOut", times: [0, 0.12, 0.28], delay }
              }
            />
          );
        })}

        {AGENTS.map((agent) => (
          <g key={agent.id} transform={`translate(${AGENT_X}, ${agent.y})`}>
            <rect x={-58} y={-16} width={116} height={32} rx={6} className="bf-node bf-agent-node" />
            <text x={0} y={5} textAnchor="middle" className="bf-node-label">
              {agent.label}
            </text>
          </g>
        ))}

        <text x={RELAY.x} y={RELAY.y - 62} textAnchor="middle" className="bf-callout">
          “hey relay, do this”
        </text>

        <g transform={`translate(${RELAY.x}, ${RELAY.y})`}>
          <circle r={38} className="bf-node bf-relay-node" />
          <text y={-4} textAnchor="middle" className="bf-relay-label">
            relay
          </text>
          <text y={14} textAnchor="middle" className="bf-relay-sub">
            (MCP)
          </text>
        </g>

        <path
          d={`M ${RELAY.x + 38} ${RELAY.y} L ${RESULT.x - 60} ${RESULT.y}`}
          className="bf-trunk"
          fill="none"
          strokeWidth={2}
        />

        {STAGES.map((stage) => (
          <g key={stage.id} transform={`translate(${stage.x}, ${RELAY.y})`}>
            <motion.circle
              r={6}
              className="bf-tick"
              initial={false}
              animate={reduceMotion ? { fill: GREEN } : { fill: [DIM, GREEN, DIM] }}
              transition={
                reduceMotion
                  ? undefined
                  : {
                      duration: CYCLE,
                      repeat: Infinity,
                      ease: "easeInOut",
                      times: [Math.max(stage.time - 0.05, 0), stage.time, Math.min(stage.time + 0.08, 1)],
                    }
              }
            />
            <text y={28} textAnchor="middle" className="bf-stage-label">
              {stage.label}
            </text>
          </g>
        ))}

        {!reduceMotion && (
          <motion.circle
            r={6}
            className="bf-packet"
            initial={false}
            animate={{
              cx: [RELAY.x + 38, RELAY.x + 38, RESULT.x - 60, RESULT.x - 60],
              cy: RELAY.y,
              opacity: [0, 1, 1, 0],
            }}
            transition={{ duration: CYCLE, repeat: Infinity, ease: "easeInOut", times: [0.28, 0.32, 0.86, 0.9] }}
          />
        )}

        <g transform={`translate(${RESULT.x}, ${RESULT.y})`}>
          <rect x={-58} y={-18} width={116} height={36} rx={6} className="bf-node bf-result-node" />
          <text y={5} textAnchor="middle" className="bf-result-label">
            git diff ✓
          </text>
        </g>
      </svg>
      <p className="bf-caption">
        relay reads the task, matches it to a quality tier, and routes to the <em>cheapest backend that clears the
        bar</em> — then verifies with your own lint and tests before handing back a clean diff.
      </p>
    </div>
  );
}
