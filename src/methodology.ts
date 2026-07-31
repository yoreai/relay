import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EMBEDDED_WORKER_MD } from "./embedded_defaults.ts";
import { relayConfigDir } from "./paths.ts";

/**
 * The worker method: the standing discipline every delegated worker gets,
 * whichever CLI serves it. It grew out of three hardcoded guard strings in
 * brief.ts, each written after a real incident; this is the same idea as
 * policy-as-data (router.yaml) applied to worker behavior — shipped as a
 * default, overridable by the user, never edited by relay.
 *
 * The split that matters:
 *  - GUARDS stay in code (brief.ts). Recursion, no-op, read-only are safety;
 *    an override file must not be able to remove them.
 *  - METHOD is this module: style-of-work rules that shape the diff and the
 *    reply. User-overridable at ~/.config/relay/worker.md, replacing the
 *    bundled text entirely; an empty file turns the method off.
 *  - No repo-level worker.md, deliberately. A prompt sourced from a cloned
 *    repo is an injection channel — the same trust problem as repo-sourced
 *    verify commands, without the `relay trust` gate to hold it.
 *
 * Lane-aware because the rules contradict each other across lanes: "smallest
 * correct diff" is noise on a lane that must not produce a diff at all.
 */

export type WorkerMethod = { always: string; write: string; read: string };

const SECTIONS = ["always", "write", "read"] as const;

/**
 * Everything above the first recognized "## " heading is ignored — that is
 * where the file's own documentation lives. A file with content but no
 * recognized headings is treated as all-lanes text, so a user override
 * doesn't silently vanish over a formatting detail.
 */
export function parseWorkerMethod(md: string): WorkerMethod {
  const out: WorkerMethod = { always: "", write: "", read: "" };
  let current: (typeof SECTIONS)[number] | null = null;
  let sawHeading = false;
  const body: Record<string, string[]> = { always: [], write: [], read: [] };
  for (const line of md.split("\n")) {
    const h = line.match(/^##\s+(\w+)\s*$/);
    if (h) {
      sawHeading = true;
      const name = h[1]!.toLowerCase();
      current = (SECTIONS as readonly string[]).includes(name)
        ? (name as (typeof SECTIONS)[number])
        : null;
      continue;
    }
    if (current) body[current]!.push(line);
  }
  if (!sawHeading && md.trim()) {
    out.always = md.trim();
    return out;
  }
  for (const s of SECTIONS) out[s] = body[s]!.join("\n").trim();
  return out;
}

function loadWorkerMethod(): WorkerMethod {
  try {
    const override = readFileSync(
      join(relayConfigDir(), "worker.md"),
      "utf8",
    );
    // An empty override is a deliberate off switch, not a missing file.
    return parseWorkerMethod(override);
  } catch {
    return parseWorkerMethod(EMBEDDED_WORKER_MD);
  }
}

/**
 * The method text for one run, or "" when the user turned it off.
 *
 * Read fresh per run rather than cached: a run takes minutes, the read takes
 * microseconds, and a stale copy of a file the user just edited is exactly
 * the staleness bug this codebase keeps having to fix elsewhere.
 *
 * Never throws — a style layer must not be able to fail a run.
 */
export function workerMethod(write?: "none" | "tree" | "worktree"): string {
  try {
    const m = loadWorkerMethod();
    const lane = write === "none" ? m.read : m.write;
    return [m.always, lane].filter(Boolean).join("\n").trim();
  } catch {
    return "";
  }
}
