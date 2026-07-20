import { CursorBackend } from "./backends/cursor.ts";
import { ClaudeBackend } from "./backends/claude.ts";
import { which } from "./which.ts";
import { findDirectivePath, relayConfigDir, relayDataDir } from "./paths.ts";
import { loadDirective } from "./directive.ts";
import { existsSync } from "node:fs";

export async function runDoctor(cwd: string = process.cwd()): Promise<string> {
  const lines: string[] = ["relay doctor", ""];

  const dirPath = findDirectivePath(cwd);
  try {
    const d = loadDirective(cwd);
    lines.push(
      `directive: ${dirPath ?? "(bundled default)"} · ${d.lanes.length} lanes · baseline ${d.baseline}`,
    );
  } catch (e) {
    lines.push(`directive: ERROR ${(e as Error).message}`);
  }

  lines.push(`config dir: ${relayConfigDir()}${existsSync(relayConfigDir()) ? "" : " (missing — run relay init)"}`);
  lines.push(`data dir:   ${relayDataDir()}`);
  lines.push("");

  const reports = await Promise.all([
    new CursorBackend().doctor(),
    new ClaudeBackend().doctor(),
  ]);

  for (const r of reports) {
    const mark = r.present ? "✓" : "✗";
    lines.push(`${mark} ${r.backend}: ${r.message}`);
    if (r.fix && !r.present) lines.push(`    fix: ${r.fix}`);
  }

  lines.push("");
  lines.push(`git: ${which("git") ? "✓ on PATH" : "✗ missing"}`);
  lines.push(`gh:  ${which("gh") ? "✓ on PATH (draft PRs for worktree lanes)" : "· not found (optional)"}`);
  lines.push(`bd:  ${which("bd") ? "✓ on PATH (beads context)" : "· not found (optional)"}`);

  lines.push("");
  lines.push("Auth is delegated — relay stores no credentials.");
  return lines.join("\n");
}
