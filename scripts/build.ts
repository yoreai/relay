#!/usr/bin/env bun
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const version = process.env.RELAY_VERSION ?? "0.1.0";
const outDir = join(import.meta.dir, "..", "dist");
mkdirSync(outDir, { recursive: true });

const targets = [
  { triple: "bun-darwin-arm64", name: "relay-darwin-arm64" },
  { triple: "bun-darwin-x64", name: "relay-darwin-x64" },
  { triple: "bun-linux-x64", name: "relay-linux-x64" },
  { triple: "bun-linux-arm64", name: "relay-linux-arm64" },
];

const only = process.argv.includes("--current")
  ? targets.filter((t) => {
      const os = process.platform === "darwin" ? "darwin" : "linux";
      const arch = process.arch === "arm64" ? "arm64" : "x64";
      return t.triple === `bun-${os}-${arch}`;
    })
  : targets;

for (const t of only) {
  const outfile = join(outDir, t.name);
  console.log(`building ${t.name} (v${version})…`);
  const result = Bun.spawnSync(
    [
      "bun",
      "build",
      "--compile",
      `--target=${t.triple}`,
      join(import.meta.dir, "..", "src", "cli.ts"),
      "--outfile",
      outfile,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (result.exitCode !== 0) {
    console.error(`failed: ${t.name}`);
    process.exit(result.exitCode ?? 1);
  }
}

console.log(`done → ${outDir}`);
