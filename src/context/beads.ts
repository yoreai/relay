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
    const proc = Bun.spawn(args, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
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
