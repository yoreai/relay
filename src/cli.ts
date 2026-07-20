#!/usr/bin/env bun
import { runAdvise } from "./advise.ts";
import { runDoctor } from "./doctor.ts";
import { runInit } from "./init.ts";
import { serveMcp } from "./mcp.ts";
import { formatOutcome, runTask } from "./run.ts";
import { getRun, modelStats, readRuns, summarizeSavings } from "./runlog.ts";
import { runSetup } from "./setup.ts";
import { runUpdate } from "./update.ts";
import { RELAY_VERSION as VERSION } from "./version.ts";

function usage(): string {
  return `relay ${VERSION} — interface-independent task router

Usage:
  relay "fix the flaky retry test in src/api"
  relay -i
  relay setup                    # register relay as MCP server in installed agents
  relay update [--check]         # refresh model catalog · check for new release
  relay advise [--apply]         # cheaper same-class models for your tiers
  relay status [id|--all]
  relay savings [--by-lane|--by-model]
  relay doctor
  relay init
  relay mcp serve
  relay --lane build "…"
  relay --tier deep "…"
  relay --dry-run "…"

Flags:
  --lane <name>     force lane
  --tier <name>     force tier
  --dry-run         print routing + brief, run nothing
  --walkaway        hint build/worktree lane
  --log-tasks       store task text in runs.jsonl (off by default)
  --cwd <path>      working directory
  -h, --help        show help
  -V, --version     show version
`;
}

type Parsed = {
  command?: string;
  task?: string;
  lane?: string;
  tier?: string;
  dryRun?: boolean;
  walkaway?: boolean;
  logTasks?: boolean;
  cwd?: string;
  interactive?: boolean;
  rest: string[];
};

function parseArgs(argv: string[]): Parsed {
  const out: Parsed = { rest: [] };
  const args = [...argv];
  while (args.length) {
    const a = args.shift()!;
    if (a === "-h" || a === "--help") {
      out.command = "help";
    } else if (a === "-V" || a === "--version") {
      out.command = "version";
    } else if (a === "-i") {
      out.interactive = true;
    } else if (a === "--dry-run") {
      out.dryRun = true;
    } else if (a === "--walkaway") {
      out.walkaway = true;
    } else if (a === "--log-tasks") {
      out.logTasks = true;
    } else if (a === "--lane") {
      out.lane = args.shift();
    } else if (a === "--tier") {
      out.tier = args.shift();
    } else if (a === "--cwd") {
      out.cwd = args.shift();
    } else if (
      [
        "status",
        "savings",
        "doctor",
        "init",
        "mcp",
        "setup",
        "update",
        "advise",
        "help",
        "version",
      ].includes(a)
    ) {
      out.command = a;
      out.rest = args;
      break;
    } else if (a.startsWith("-")) {
      throw new Error(`unknown flag: ${a}`);
    } else {
      out.task = a;
      // join remaining as task continuation if any non-flag
      if (args.length && !args[0]!.startsWith("-")) {
        out.task = [a, ...args].join(" ");
        args.length = 0;
      }
    }
  }
  return out;
}

async function repl(cwd: string): Promise<void> {
  console.log("relay interactive — type a task, or :q to quit");
  const prompt = "relay> ";
  while (true) {
    process.stdout.write(prompt);
    const line = await readLine();
    if (line == null) break;
    const t = line.trim();
    if (!t || t === ":q" || t === "exit" || t === "quit") break;
    if (t === ":doctor") {
      console.log(await runDoctor(cwd));
      continue;
    }
    try {
      const outcome = await runTask({ task: t, cwd });
      console.log(formatOutcome(outcome));
    } catch (e) {
      console.error(`error: ${(e as Error).message}`);
    }
  }
}

function readLine(): Promise<string | null> {
  return new Promise((resolve) => {
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      if (buf.includes("\n")) {
        process.stdin.off("data", onData);
        resolve(buf.replace(/\n$/, ""));
      }
    };
    process.stdin.on("data", onData);
    process.stdin.once("end", () => resolve(null));
  });
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const cwd = parsed.cwd ?? process.cwd();

  if (parsed.command === "help" || (!parsed.command && !parsed.task && !parsed.interactive)) {
    console.log(usage());
    return;
  }
  if (parsed.command === "version") {
    console.log(VERSION);
    return;
  }
  if (parsed.interactive) {
    await repl(cwd);
    return;
  }
  if (parsed.command === "doctor") {
    console.log(await runDoctor(cwd));
    return;
  }
  if (parsed.command === "init") {
    console.log(runInit(cwd));
    return;
  }
  if (parsed.command === "setup") {
    console.log(runSetup());
    return;
  }
  if (parsed.command === "update") {
    console.log(await runUpdate({ check: parsed.rest.includes("--check") }));
    return;
  }
  if (parsed.command === "advise") {
    console.log(runAdvise(cwd, parsed.rest.includes("--apply")));
    return;
  }
  if (parsed.command === "mcp") {
    if (parsed.rest[0] !== "serve") {
      console.error("usage: relay mcp serve");
      process.exit(2);
    }
    await serveMcp();
    return;
  }
  if (parsed.command === "status") {
    const id = parsed.rest.find((r) => r !== "--all");
    if (id && id !== "--all") {
      const run = getRun(id);
      console.log(run ? JSON.stringify(run, null, 2) : `no run ${id}`);
      return;
    }
    const runs = readRuns(parsed.rest.includes("--all") ? 200 : 20);
    if (!runs.length) {
      console.log("no runs yet");
      return;
    }
    for (const r of runs) {
      console.log(
        `${r.ts}  ${r.id}  ${r.status.padEnd(7)}  ${r.lane}/${r.model}` +
          (r.saved_usd != null ? `  ~$${r.saved_usd.toFixed(2)}` : ""),
      );
    }
    return;
  }
  if (parsed.command === "savings") {
    const s = summarizeSavings();
    console.log(`total saved: ~$${s.totalSavedUsd.toFixed(2)} across ${s.runs} ok runs`);
    console.log(`  measured: ${s.measuredRuns} · estimated: ${s.estimatedRuns}`);
    if (parsed.rest.includes("--by-lane")) {
      console.log("by lane:");
      for (const [k, v] of Object.entries(s.byLane)) {
        console.log(`  ${k}: ~$${v.toFixed(2)}`);
      }
    }
    if (parsed.rest.includes("--by-model")) {
      console.log("by model:");
      const stats = modelStats();
      for (const [k, v] of Object.entries(s.byModel)) {
        const st = stats[k];
        console.log(
          `  ${k}: ~$${v.toFixed(2)}` +
            (st ? `  (verified ${st.ok}/${st.runs} runs)` : ""),
        );
      }
    }
    if (
      !parsed.rest.includes("--by-lane") &&
      !parsed.rest.includes("--by-model")
    ) {
      console.log("(pass --by-lane / --by-model for breakdowns)");
    }
    return;
  }

  if (!parsed.task) {
    console.log(usage());
    process.exit(2);
  }

  const outcome = await runTask({
    task: parsed.task,
    cwd,
    lane: parsed.lane,
    tier: parsed.tier,
    dryRun: parsed.dryRun,
    walkaway: parsed.walkaway,
    logTasks: parsed.logTasks,
    backendOverride: process.env.RELAY_BACKEND,
  });
  console.log(formatOutcome(outcome));
  if (!outcome.dryRun && !outcome.verifyOk) process.exit(1);
}

main().catch((e) => {
  console.error(`relay: ${(e as Error).message}`);
  process.exit(1);
});
