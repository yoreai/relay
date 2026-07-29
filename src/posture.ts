import {
  detectCursorFlags,
  discoverCursorBinary,
  type CursorFlagSupport,
} from "./backends/cursor.ts";

/**
 * "The CLI on this machine can't do what the lane promised."
 *
 * Backend CLIs gain and lose flags between releases, and relay's answer is to
 * feature-detect and degrade rather than crash (AGENTS.md). Degrading quietly,
 * though, turns a drifted CLI into a permission change the user never chose: a
 * lane declared read-only stops being enforced as read-only and nothing says
 * so. This module turns a detected gap into one sentence that names the
 * consequence and the fix, for the surfaces that are read fresh — `relay
 * doctor`, and the run result itself.
 *
 * Capability, never a version number. "Older than 2026.02" would mean pulling
 * a third party's release feed (relay makes no such call) and maintaining a
 * version→flag map that goes stale the moment upstream renames a flag. What
 * `--help` says today is both cheaper and permanently true.
 *
 * Silent when nothing is actually reduced. A build that merely predates
 * `--trust` runs correctly without it — relay simply doesn't pass it — so
 * warning there would train people to ignore the warning that matters.
 */

/** What a missing flag actually costs the user, in their terms. */
const CURSOR_CONSEQUENCES: Record<string, string> = {
  mode:
    "read-only lanes can only be requested in the prompt, not enforced in the CLI's " +
    "own flags, so a lane you declared read-only can still write",
  sandbox: "write lanes run without cursor's command sandbox",
};

/**
 * Pure composer — the whole decision, so it can be tested without a machine.
 * `backend` is carried through so the message names the CLI the user has to
 * update rather than a generic "your agent CLI".
 */
export function composePostureWarning(
  backend: string,
  supports: CursorFlagSupport,
): string | null {
  if (backend !== "cursor") return null;
  const missing = (["mode", "sandbox"] as const).filter((f) => !supports[f]);
  if (missing.length === 0) return null;
  const flags = missing.map((f) => `--${f}`).join(" or ");
  const costs = missing.map((f) => CURSOR_CONSEQUENCES[f]).join("; and ");
  return (
    `cursor-agent on this machine doesn't support ${flags} — ${costs}. ` +
    `Tell the user to run \`cursor-agent update\`; relay won't run it for them.`
  );
}

/**
 * Posture gap for one backend, or null when there's nothing to report.
 *
 * Only cursor detects its own flags today; every other backend answers null
 * rather than guessing. Adding one means detecting its flags first — a warning
 * relay can't substantiate is worse than none.
 *
 * Never throws: a diagnostic must not be able to fail a run.
 */
export async function backendPostureWarning(
  backend: string,
  binary?: string,
): Promise<string | null> {
  try {
    if (backend !== "cursor") return null;
    const bin = discoverCursorBinary(binary);
    if (!bin) return null;
    return composePostureWarning(backend, await detectCursorFlags(bin));
  } catch {
    return null;
  }
}

/** Every installed backend's gaps, for `doctor`'s whole-machine view. */
export async function postureWarnings(
  backends: Iterable<string>,
): Promise<string[]> {
  const out: string[] = [];
  for (const backend of backends) {
    const warning = await backendPostureWarning(backend);
    if (warning) out.push(warning);
  }
  return out;
}
