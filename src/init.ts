import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EMBEDDED_ROUTER_YAML } from "./embedded_defaults.ts";
import { relayConfigDir } from "./paths.ts";

export function runInit(cwd: string = process.cwd()): string {
  const lines: string[] = [];
  const configDir = relayConfigDir();
  mkdirSync(configDir, { recursive: true });

  const userRouter = join(configDir, "router.yaml");
  if (!existsSync(userRouter)) {
    writeFileSync(userRouter, EMBEDDED_ROUTER_YAML, "utf8");
    lines.push(`wrote ${userRouter}`);
  } else {
    lines.push(`kept existing ${userRouter}`);
  }

  // Deliberately no prices.yaml: prices come from the catalog so `relay update`
  // can fix them. Writing one here used to freeze a copy of the price table in
  // user config, where nothing could ever correct it.
  const userPrices = join(configDir, "prices.yaml");
  if (existsSync(userPrices)) {
    lines.push(
      `note: ${userPrices} overrides catalog prices — delete it to track the catalog`,
    );
  }

  // Deliberately no repo-local copy. relay used to write one here and rank it
  // above user config, so a committed directive decided vendor, context budget,
  // write mode and verify commands for everyone who cloned the repo. Policy is
  // per-user now; a repo-local file is only a fallback for users who have none,
  // and its permission grants are clamped.
  for (const stale of [join(cwd, "router.yaml"), join(cwd, ".relay", "router.yaml")]) {
    if (existsSync(stale)) {
      lines.push(
        `note: ${stale} is repo-local — ${userRouter} now wins, and ` +
          `\`autonomy: full\`/\`write: worktree\` are ignored from repo files`,
      );
    }
  }

  const notes: string[] = [];
  if (existsSync(join(cwd, "package.json"))) notes.push("js/ts repo detected");
  if (existsSync(join(cwd, "Cargo.toml"))) notes.push("rust repo detected");
  if (existsSync(join(cwd, "pyproject.toml"))) notes.push("python repo detected");
  if (notes.length) lines.push(`detect: ${notes.join(", ")}`);

  lines.push("done. edit router.yaml to own your routing policy.");
  return lines.join("\n");
}
