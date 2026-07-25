import { toolEnv } from "../env.ts";
import { which } from "../which.ts";

/** Optional beads (`bd`) graph pull. Feature-detects `bd` on PATH. */
export async function pullBeadsContext(
  cwd: string,
  query?: string,
): Promise<string | null> {
  if (!which("bd")) return null;
  try {
    const args = query
      ? ["bd", "show", query, "--json"]
      : ["bd", "ready", "--json"];
    // `bd` is a third-party binary found on PATH, not a backend relay
    // dispatches — it gets a reduced environment, not the user's credentials.
    const proc = Bun.spawn(args, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: toolEnv(),
    });
    const [stdout, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    if (exitCode !== 0 || !stdout.trim()) return null;
    return `## beads\n\`\`\`json\n${stdout.trim().slice(0, 8_000)}\n\`\`\``;
  } catch {
    return null;
  }
}
