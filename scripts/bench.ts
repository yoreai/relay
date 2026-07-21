#!/usr/bin/env bun
/**
 * relay bench — small, honest quality-parity benchmark.
 *
 * Each fixture is a tiny repo with a deliberate bug and a deterministic
 * test suite. Every task runs twice with identical prompts:
 *   arm "routed"   — relay's normal routing (quickfix lane, work tier)
 *   arm "frontier" — same lane forced to the deep tier (frontier model)
 * Grading is the repo's own tests (objective pass/fail, no LLM judge).
 * Costs use list prices; cursor-backend token counts are byte-estimates,
 * but the SAME estimator runs in both arms, so the ratio is meaningful.
 *
 * Usage: bun run scripts/bench.ts [--tasks slugify,clamp] [--arms routed,frontier]
 */
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTask } from "../src/run.ts";

type ArmResult = {
  task: string;
  arm: string;
  model: string;
  backend: string;
  pass: boolean;
  escalations: number;
  costUsd: number | null;
  estimated: boolean | null;
  seconds: number;
};

const root = join(import.meta.dir, "..");
const tasksDir = join(root, "bench", "tasks");

const argTasks = process.argv.find((a) => a.startsWith("--tasks="))?.slice(8);
const argArms = process.argv.find((a) => a.startsWith("--arms="))?.slice(7);
const taskNames = argTasks ? argTasks.split(",") : readdirSync(tasksDir).sort();
const arms = argArms ? argArms.split(",") : ["routed", "frontier"];

async function shell(cwd: string, cmd: string[]): Promise<number> {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return await proc.exited;
}

async function prepareRepo(taskName: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), `relay-bench-${taskName}-`));
  cpSync(join(tasksDir, taskName), dir, { recursive: true });
  await shell(dir, ["git", "init", "-q"]);
  await shell(dir, ["git", "config", "user.email", "bench@relay"]);
  await shell(dir, ["git", "config", "user.name", "bench"]);
  await shell(dir, ["git", "add", "-A"]);
  await shell(dir, ["git", "commit", "-qm", "fixture"]);
  return dir;
}

const results: ArmResult[] = [];

for (const taskName of taskNames) {
  const meta = JSON.parse(
    readFileSync(join(tasksDir, taskName, "meta.json"), "utf8"),
  ) as { name: string; prompt: string };

  for (const arm of arms) {
    const cwd = await prepareRepo(taskName);
    const t0 = Date.now();
    console.log(`▸ ${taskName} / ${arm} …`);
    try {
      const outcome = await runTask({
        task: meta.prompt,
        cwd,
        lane: "quickfix",
        tier: arm === "frontier" ? "deep" : undefined,
      });
      const r: ArmResult = {
        task: taskName,
        arm,
        model: outcome.model,
        backend: outcome.backend,
        pass: outcome.verifyOk,
        escalations: outcome.escalations,
        costUsd: outcome.receipt?.costUsedUsd ?? null,
        estimated: outcome.receipt?.estimated ?? null,
        seconds: Math.round((Date.now() - t0) / 100) / 10,
      };
      results.push(r);
      console.log(
        `  ${r.pass ? "✓" : "✗"} ${r.model} · $${r.costUsd?.toFixed(4) ?? "?"} · ${r.seconds}s` +
          (r.escalations ? ` · escalations ${r.escalations}` : ""),
      );
    } catch (e) {
      results.push({
        task: taskName,
        arm,
        model: "-",
        backend: "-",
        pass: false,
        escalations: 0,
        costUsd: null,
        estimated: null,
        seconds: Math.round((Date.now() - t0) / 100) / 10,
      });
      console.log(`  ✗ error: ${(e as Error).message}`);
    }
  }
}

// summarize
const byTask = new Map<string, Record<string, ArmResult>>();
for (const r of results) {
  const entry = byTask.get(r.task) ?? {};
  entry[r.arm] = r;
  byTask.set(r.task, entry);
}

let routedPass = 0;
let frontierPass = 0;
const ratios: number[] = [];
for (const [, e] of byTask) {
  if (e.routed?.pass) routedPass++;
  if (e.frontier?.pass) frontierPass++;
  if (e.routed?.costUsd && e.frontier?.costUsd) {
    ratios.push(e.frontier.costUsd / e.routed.costUsd);
  }
}
ratios.sort((a, b) => a - b);
const medianRatio = ratios.length
  ? ratios[Math.floor(ratios.length / 2)]!
  : null;

const summary = {
  date: new Date().toISOString().slice(0, 10),
  tasks: byTask.size,
  routed_pass: routedPass,
  frontier_pass: frontierPass,
  median_cost_ratio: medianRatio ? Math.round(medianRatio * 10) / 10 : null,
  note: "cursor-backend costs are byte-estimated; identical estimator in both arms, so ratios are comparable. grading = each repo's own tests.",
  results,
};

const outDir = join(root, "bench", "results");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, `${summary.date}.json`),
  JSON.stringify(summary, null, 2),
);
writeFileSync(join(outDir, "latest.json"), JSON.stringify(summary, null, 2));

console.log("");
console.log(
  `BENCH DONE — quality: routed ${routedPass}/${byTask.size} vs frontier ${frontierPass}/${byTask.size}` +
    (medianRatio ? ` · median cost ratio ${medianRatio.toFixed(1)}x` : ""),
);
console.log(`results → bench/results/latest.json`);
