import type { Backend } from "./types.ts";
import { CursorBackend, discoverCursorBinary } from "./cursor.ts";
import { ClaudeBackend, discoverClaudeBinary } from "./claude.ts";
import { FakeBackend } from "./fake.ts";
import { CLI_SPECS, discoverCliBinary, GenericCliBackend } from "./cli.ts";
import { disabledBackends } from "../settings.ts";

/** Every backend name relay can route to (catalog entries must stay within this). */
export const KNOWN_BACKENDS = [
  "cursor",
  "claude",
  ...Object.keys(CLI_SPECS),
  "fake",
] as const;

export function getBackend(name: string): Backend {
  switch (name) {
    case "cursor":
      return new CursorBackend();
    case "claude":
      return new ClaudeBackend();
    case "fake":
      return new FakeBackend();
    default: {
      const spec = CLI_SPECS[name];
      if (spec) return new GenericCliBackend(spec);
      throw new Error(
        `Unknown backend "${name}". Supported: ${KNOWN_BACKENDS.filter((b) => b !== "fake").join(", ")}`,
      );
    }
  }
}

/** Backends whose CLI is present on this machine right now. */
export function installedBackends(): Set<string> {
  const s = new Set<string>();
  if (process.env.RELAY_ALLOW_FAKE) s.add("fake");
  if (discoverCursorBinary()) s.add("cursor");
  if (discoverClaudeBinary()) s.add("claude");
  for (const [name, spec] of Object.entries(CLI_SPECS)) {
    if (discoverCliBinary(spec)) s.add(name);
  }
  return s;
}

/** Installed backends minus the ones the user disabled (org policy etc.). */
export function availableBackends(): Set<string> {
  const s = installedBackends();
  for (const name of disabledBackends()) s.delete(name);
  return s;
}

export type { Backend, BackendResult, DoctorReport, Usage } from "./types.ts";
export { CursorBackend } from "./cursor.ts";
export { ClaudeBackend } from "./claude.ts";
export { FakeBackend } from "./fake.ts";
