import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

/** Resolve an executable on PATH (or return null). */
export function which(cmd: string): string | null {
  if (cmd.includes("/") || cmd.includes("\\")) {
    return existsSync(cmd) ? cmd : null;
  }
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, cmd);
    if (existsSync(candidate)) return candidate;
    // Windows-style — we don't ship Windows in v1, but harmless
    if (existsSync(candidate + ".exe")) return candidate + ".exe";
  }
  return null;
}
