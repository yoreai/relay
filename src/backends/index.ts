import type { Backend } from "./types.ts";
import { CursorBackend, discoverCursorBinary } from "./cursor.ts";
import { ClaudeBackend, discoverClaudeBinary } from "./claude.ts";
import { FakeBackend } from "./fake.ts";

export function getBackend(name: string): Backend {
  switch (name) {
    case "cursor":
      return new CursorBackend();
    case "claude":
      return new ClaudeBackend();
    case "fake":
      return new FakeBackend();
    default:
      throw new Error(
        `Unknown backend "${name}". Supported: cursor, claude` +
          (process.env.RELAY_ALLOW_FAKE ? ", fake" : ""),
      );
  }
}

/** Backends whose CLI is actually present on this machine right now. */
export function availableBackends(): Set<string> {
  const s = new Set<string>(["fake"]);
  if (discoverCursorBinary()) s.add("cursor");
  if (discoverClaudeBinary()) s.add("claude");
  return s;
}

export type { Backend, BackendResult, DoctorReport, Usage } from "./types.ts";
export { CursorBackend } from "./cursor.ts";
export { ClaudeBackend } from "./claude.ts";
export { FakeBackend } from "./fake.ts";
