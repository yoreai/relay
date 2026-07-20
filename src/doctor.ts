import { CursorBackend } from "./backends/cursor.ts";
import { ClaudeBackend } from "./backends/claude.ts";
import { availableBackends } from "./backends/index.ts";
import { loadCatalog } from "./catalog.ts";
import { which } from "./which.ts";
import { findDirectivePath, relayConfigDir, relayDataDir } from "./paths.ts";
import { loadDirective, resolveTier } from "./directive.ts";
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
  try {
    const { catalog, source } = loadCatalog();
    lines.push(
      `catalog:    ${Object.keys(catalog.models).length} models · updated ${catalog.updated} · source ${source} (refresh: relay update)`,
    );
  } catch (e) {
    lines.push(`catalog:    ERROR ${(e as Error).message}`);
  }
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

  // Show where each tier actually lands on THIS machine
  try {
    const d = loadDirective(cwd);
    const available = availableBackends();
    lines.push("");
    lines.push("tier resolution (on this machine):");
    for (const tierName of Object.keys(d.tiers)) {
      try {
        const t = resolveTier(d, tierName, available);
        lines.push(
          `  ${tierName.padEnd(7)} → ${t.backend}/${t.model}` +
            (t.fallback ? "  (fallback)" : ""),
        );
      } catch {
        lines.push(`  ${tierName.padEnd(7)} → ✗ no installed backend`);
      }
    }
  } catch {
    // directive already reported above
  }

  lines.push("");
  lines.push(`git: ${which("git") ? "✓ on PATH" : "✗ missing"}`);
  lines.push(`gh:  ${which("gh") ? "✓ on PATH (draft PRs for worktree lanes)" : "· not found (optional)"}`);
  lines.push(`bd:  ${which("bd") ? "✓ on PATH (beads context)" : "· not found (optional)"}`);

  lines.push("");
  lines.push("Auth is delegated — relay stores no credentials.");
  return lines.join("\n");
}
