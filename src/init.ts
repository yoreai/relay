import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMBEDDED_PRICES_YAML,
  EMBEDDED_ROUTER_YAML,
} from "./embedded_defaults.ts";
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

  const userPrices = join(configDir, "prices.yaml");
  if (!existsSync(userPrices)) {
    writeFileSync(userPrices, EMBEDDED_PRICES_YAML, "utf8");
    lines.push(`wrote ${userPrices}`);
  } else {
    lines.push(`kept existing ${userPrices}`);
  }

  const repoRelay = join(cwd, ".relay");
  mkdirSync(repoRelay, { recursive: true });
  const repoRouter = join(cwd, "router.yaml");
  if (!existsSync(repoRouter) && !existsSync(join(cwd, ".relay", "router.yaml"))) {
    writeFileSync(join(repoRelay, "router.yaml"), EMBEDDED_ROUTER_YAML, "utf8");
    lines.push(`wrote ${join(repoRelay, "router.yaml")} (repo override)`);
  }

  const notes: string[] = [];
  if (existsSync(join(cwd, "package.json"))) notes.push("js/ts repo detected");
  if (existsSync(join(cwd, "Cargo.toml"))) notes.push("rust repo detected");
  if (existsSync(join(cwd, "pyproject.toml"))) notes.push("python repo detected");
  if (notes.length) lines.push(`detect: ${notes.join(", ")}`);

  lines.push("done. edit router.yaml to own your routing policy.");
  return lines.join("\n");
}
