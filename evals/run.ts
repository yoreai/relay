// relay eval suite — end-to-end scenarios against the real MCP surface and
// (optionally) real host CLIs. Run: `bun run evals` (add --hosts for the
// host-delegation layer; it spends a few extra cents and needs authed CLIs).
//
// This is NOT the unit test suite (`bun test`): these scenarios spawn real
// backend workers and spend real (cent-level) money. Not run in CI.

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  Blocked,
  RelayMcp,
  ROOT,
  expect,
  git,
  makeBareDir,
  makeRepo,
  runScenario,
  type ScenarioResult,
} from "./harness.ts";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const WANT_HOSTS = process.argv.includes("--hosts");

type RunJson = {
  id?: string;
  verifyOk?: boolean;
  filesChanged?: string[];
  receipt?: {
    estimated?: boolean;
    savedUsd?: number;
    costUsedUsd?: number;
    costBaselineUsd?: number;
    tokensOut?: number;
    line?: string;
  };
  work_branch?: string;
  status?: string;
};

const results: ScenarioResult[] = [];

async function mcpScenarios(): Promise<void> {
  // ---- S1: write lane edits the tree like any agent; receipt sane ---------
  results.push(
    await runScenario("write-lane: typo fixed in tree (unstaged), receipt measured & sane", "mcp", async () => {
      const repo = makeRepo("write");
      const mcp = await RelayMcp.spawn();
      try {
        const r = await mcp.call("relay_run", {
          task: "fix the typo in hello.txt: 'teh' should be 'the'",
          cwd: repo,
        });
        expect(r.ok, `run failed: ${r.text.slice(0, 200)}`);
        const j = r.json as RunJson;
        expect(j.verifyOk === true, "verify failed");
        expect((j.filesChanged ?? []).includes("hello.txt"), `filesChanged=${JSON.stringify(j.filesChanged)}`);
        expect(readFileSync(join(repo, "hello.txt"), "utf8").includes("the world"), "typo not fixed on disk");
        expect(git(repo, ["diff", "--name-only"]).includes("hello.txt"), "edit not in working tree");
        expect(git(repo, ["diff", "--cached", "--name-only"]) === "", "relay staged the edit — tree lanes must not touch the index");
        const rec = j.receipt;
        expect(!!rec, "no receipt");
        expect(rec!.estimated === false, "receipt not [measured]");
        expect((rec!.tokensOut ?? 1e9) < 20_000, `implausible tokensOut=${rec!.tokensOut}`);
        expect((rec!.costUsedUsd ?? 1) < (rec!.costBaselineUsd ?? 0), "cost >= baseline");
        expect((rec!.savedUsd ?? 0) > 0, "no savings on cheap-model run");
        return `${rec!.line} · out=${rec!.tokensOut}tok`;
      } finally {
        await mcp.close();
      }
    }),
  );

  // ---- S2: read-only review lane leaves the tree untouched ----------------
  results.push(
    await runScenario("read-only: review lane reports without touching files", "mcp", async () => {
      const repo = makeRepo("review");
      const mcp = await RelayMcp.spawn();
      try {
        const r = await mcp.call("relay_run", {
          task: "review hello.txt and report any spelling issues — do not change anything",
          cwd: repo,
        });
        expect(r.ok, `run failed: ${r.text.slice(0, 200)}`);
        const j = r.json as RunJson;
        expect(j.verifyOk === true, "verify failed");
        expect(git(repo, ["status", "--porcelain"]) === "", "read-only lane modified the tree");
        return "tree clean after review";
      } finally {
        await mcp.close();
      }
    }),
  );

  // ---- S3: no-op guard — absent bug produces an empty diff ----------------
  results.push(
    await runScenario("no-op guard: nonexistent bug yields zero edits", "mcp", async () => {
      const repo = makeRepo("noop");
      const mcp = await RelayMcp.spawn();
      try {
        const r = await mcp.call("relay_run", {
          task: "fix the typo 'flurbish' in hello.txt — it should say 'flourish'",
          cwd: repo,
        });
        expect(r.ok, `run failed: ${r.text.slice(0, 200)}`);
        expect(git(repo, ["status", "--porcelain"]) === "", "worker invented an edit for a nonexistent bug");
        return "no invented edits";
      } finally {
        await mcp.close();
      }
    }),
  );

  // ---- S4: cwd guard — refuses to default to a non-repo dir ---------------
  results.push(
    await runScenario("cwd guard: omitted cwd in non-repo dir is refused", "mcp", async () => {
      const bare = makeBareDir("nonrepo");
      const mcp = await RelayMcp.spawn({ cwd: bare });
      try {
        const r = await mcp.call("relay_run", { task: "say ok" }, 30_000);
        expect(!r.ok, "run was accepted without cwd in a non-repo dir");
        expect(/pass cwd/i.test(r.text), `unexpected error: ${r.text.slice(0, 200)}`);
        return "refused with actionable error";
      } finally {
        await mcp.close();
      }
    }),
  );

  // ---- S5: recursion guard — workers can't re-delegate ---------------------
  results.push(
    await runScenario("recursion guard: RELAY_WORKER server refuses relay_run", "mcp", async () => {
      const repo = makeRepo("recursion");
      const mcp = await RelayMcp.spawn({ env: { RELAY_WORKER: "1" } });
      try {
        const r = await mcp.call("relay_run", { task: "say ok", cwd: repo }, 30_000);
        expect(!r.ok, "worker was allowed to call relay_run");
        expect(/recursion guard/i.test(r.text), `unexpected error: ${r.text.slice(0, 200)}`);
        return "hard refusal";
      } finally {
        await mcp.close();
      }
    }),
  );

  // ---- S6: brief coercion — string fields agents commonly send ------------
  results.push(
    await runScenario("brief coercion: string files/done_means accepted end-to-end", "mcp", async () => {
      const repo = makeRepo("brief");
      const mcp = await RelayMcp.spawn();
      try {
        const r = await mcp.call("relay_run", {
          task: "fix the typo in hello.txt",
          cwd: repo,
          brief: {
            goal: "fix the typo in hello.txt: 'teh' should be 'the'",
            files: "hello.txt",
            done_means: "hello.txt contains 'the world'",
          },
        });
        expect(r.ok, `run failed: ${r.text.slice(0, 200)}`);
        expect((r.json as RunJson).verifyOk === true, "verify failed");
        expect(readFileSync(join(repo, "hello.txt"), "utf8").includes("the world"), "typo not fixed");
        return "string brief fields coerced, run succeeded";
      } finally {
        await mcp.close();
      }
    }),
  );

  // ---- S7: fire-and-poll — wait:false returns fast, status converges ------
  results.push(
    await runScenario("fire-and-poll: wait:false returns id fast; status reaches ok", "mcp", async () => {
      const repo = makeRepo("poll");
      const mcp = await RelayMcp.spawn();
      try {
        const t0 = Date.now();
        const r = await mcp.call(
          "relay_run",
          { task: "fix the typo in hello.txt: 'teh' should be 'the'", cwd: repo, wait: false },
          30_000,
        );
        expect(r.ok, `dispatch failed: ${r.text.slice(0, 200)}`);
        const id = (r.json as RunJson).id;
        expect(!!id, "no run id returned");
        const dispatchMs = Date.now() - t0;
        expect(dispatchMs < 15_000, `dispatch took ${dispatchMs}ms`);

        let status = "running";
        let progressCount = 0;
        for (let i = 0; i < 60 && status === "running"; i++) {
          await new Promise((res) => setTimeout(res, 5_000));
          const s = await mcp.call("relay_status", { id }, 30_000);
          const sj = s.json as { status?: string; progress?: unknown[] };
          status = sj.status ?? "running";
          progressCount = sj.progress?.length ?? 0;
        }
        expect(status === "ok", `final status=${status}`);
        expect(progressCount >= 3, `too few progress events (${progressCount})`);
        return `dispatch ${dispatchMs}ms · ${progressCount} progress events · final ok`;
      } finally {
        await mcp.close();
      }
    }),
  );

  // ---- S8: walkaway lane — worktree, branch commit, main untouched --------
  results.push(
    await runScenario("walkaway: build lane commits on relay/* branch, main untouched", "mcp", async () => {
      const repo = makeRepo("walkaway");
      const mcp = await RelayMcp.spawn();
      try {
        const r = await mcp.call(
          "relay_run",
          {
            task: "implement an add(a, b) function in math.js exporting via module.exports",
            cwd: repo,
            lane: "build",
          },
          420_000,
        );
        expect(r.ok, `run failed: ${r.text.slice(0, 200)}`);
        const j = r.json as RunJson;
        expect(j.verifyOk === true, "verify failed");
        expect(!!j.work_branch, "no work_branch in response");
        expect(git(repo, ["status", "--porcelain"]) === "", "main tree was touched");
        const branchFiles = git(repo, ["show", "--name-only", "--format=", j.work_branch!]);
        expect(branchFiles.includes("math.js"), `branch commit missing math.js: ${branchFiles}`);
        return `committed on ${j.work_branch}, main clean`;
      } finally {
        await mcp.close();
      }
    }),
  );

  // ---- S9: bad directive — readable error, not a Zod dump -----------------
  results.push(
    await runScenario("bad directive: broken router.yaml errors readably", "mcp", async () => {
      const repo = makeRepo("baddir");
      writeFileSync(join(repo, "router.yaml"), "version: 1\nbaseline: {}\n");
      const mcp = await RelayMcp.spawn();
      try {
        const r = await mcp.call("relay_run", { task: "say ok", cwd: repo }, 30_000);
        expect(!r.ok, "broken directive was accepted");
        expect(/invalid directive/i.test(r.text), `unexpected error: ${r.text.slice(0, 200)}`);
        expect(!r.text.includes('"code"'), "raw zod JSON leaked to the user");
        return "readable field-level error";
      } finally {
        await mcp.close();
      }
    }),
  );

  // ---- S10: tool surface — doctor/savings/backends respond -----------------
  results.push(
    await runScenario("tool surface: doctor (fresh), savings, backends respond", "mcp", async () => {
      const mcp = await RelayMcp.spawn();
      try {
        const doctor = await mcp.call("relay_doctor", { fresh: true }, 180_000);
        const tools = (doctor.json?.tools ?? []) as {
          tool: string;
          installed: boolean;
          signed_in: boolean | "unknown";
        }[];
        expect(doctor.ok && tools.length > 0, "doctor returned no tools");
        expect(tools.some((t) => t.tool === "cursor"), "doctor missing cursor row");
        const savings = await mcp.call("relay_savings", {}, 30_000);
        expect(savings.ok, "savings failed");
        const backends = await mcp.call("relay_backends", {}, 30_000);
        expect(backends.ok && /cursor/i.test(backends.text), "backends missing cursor row");
        const health = tools
          .filter((t) => t.installed)
          .map((t) => `${t.tool}:${t.signed_in === true ? "authed" : String(t.signed_in)}`)
          .join(" ");
        return `all respond · live auth → ${health}`;
      } finally {
        await mcp.close();
      }
    }),
  );

  // ---- S11: memory — a note deposited in one session is recalled by the ----
  // next (fresh server process = the "start a new thread" case), layered on
  // top of git activity from the repo itself.
  results.push(
    await runScenario("memory: remember in one session, recall in the next (git+notes layers)", "mcp", async () => {
      const repo = makeRepo("memory");
      const dataDir = mkdtempSync(join(tmpdir(), "relay-eval-memdata-"));

      const first = await RelayMcp.spawn({ dataDir });
      try {
        const saved = await first.call("relay_remember", {
          note: "decided: pagination uses cursor-based tokens, not offsets",
          kind: "decision",
          cwd: repo,
        });
        expect(saved.ok, `remember failed: ${saved.text.slice(0, 200)}`);
        expect(/remembered \[decision\]/.test(saved.text), "no remember confirmation");
      } finally {
        await first.close();
      }

      const second = await RelayMcp.spawn({ dataDir });
      try {
        const r = await second.call("relay_recall", { cwd: repo });
        expect(r.ok, `recall failed: ${r.text.slice(0, 200)}`);
        expect(r.text.includes("cursor-based tokens"), "note did not survive into the next session");
        expect(r.text.includes("init"), "git layer missing (no recent commits)");
        expect(/on branch/.test(r.text), "git status line missing");
        // recall must protect context, not spend it
        expect(r.text.length < 6_200, `digest too large: ${r.text.length} chars`);
        return "note survived a fresh server · git+notes layers present";
      } finally {
        await second.close();
      }
    }),
  );
}

// ---- Host layer: real CLIs, real delegation decision ------------------------
// Each host runs headless in a scratch repo with an isolated relay data dir;
// pass = the host called relay (run record exists) AND the typo got fixed.

async function hostScenario(
  name: string,
  cmd: string[],
  repo: string,
  timeoutMs: number,
): Promise<string> {
  const dataDir = mkdtempSync(join(tmpdir(), "relay-eval-hostdata-"));
  // stdin must be closed: codex exec (and possibly others) block reading a
  // piped-but-silent stdin instead of running the prompt argument.
  const proc = Bun.spawn(cmd, {
    cwd: repo,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, XDG_DATA_HOME: dataDir },
  });
  const killer = setTimeout(() => proc.kill(), timeoutMs);
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(killer);
  const hostOutput = `${out}\n${err}`;

  if (/authentication required|please run 'agent login'/i.test(hostOutput)) {
    throw new Blocked(
      `BLOCKED (environment, not product): ${name} headless auth expired — run \`${name} login\` and re-run`,
    );
  }

  expect(readFileSync(join(repo, "hello.txt"), "utf8").includes("the world"), "typo not fixed");

  // Delegation proof, strongest first:
  // 1. A relay run record in the isolated data dir (claude propagates env).
  // 2. A run record in the REAL data dir whose cwd is this scratch repo —
  //    codex/cursor spawn MCP servers with a scrubbed env, so the
  //    XDG_DATA_HOME override can't reach relay, but the record's cwd is
  //    unique to this scenario and can't come from anything else.
  // 3. The host transcript shows a completed relay_run call.
  const isoLog = join(dataDir, "relay", "runs.jsonl");
  if (existsSync(isoLog)) {
    const records = readFileSync(isoLog, "utf8").trim().split("\n").map((l) => JSON.parse(l) as RunJson);
    expect(records.some((r) => r.status === "ok"), "relay run did not finish ok");
    return `delegated · ${records.length} run record(s) · typo fixed`;
  }
  const realLog = join(
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    "relay",
    "runs.jsonl",
  );
  if (existsSync(realLog)) {
    // macOS reports temp dirs as /var/folders/… or resolved /private/var/… —
    // accept either form of this scenario's unique scratch path.
    const forms = new Set([repo, realpathSync(repo)]);
    const records = readFileSync(realLog, "utf8").trim().split("\n").map((l) => JSON.parse(l) as RunJson & { cwd?: string });
    if (records.some((r) => r.cwd && forms.has(r.cwd) && r.status === "ok")) {
      return "delegated (proof: run record with this scratch repo's cwd) · typo fixed";
    }
  }
  expect(
    /relay_run \(completed\)|relay_run.*(succeeded|completed)/i.test(hostOutput),
    `host never called relay — ${name} said: …${hostOutput.trim().slice(-200)}`,
  );
  return "delegated (proof: host transcript shows completed relay_run) · typo fixed";
}

/** Host models are nondeterministic — one retry (fresh repo) separates
 * "broken" from single-sample variance; the detail says when it was needed. */
async function withRetry(
  makeAttempt: () => Promise<string>,
): Promise<string> {
  try {
    return await makeAttempt();
  } catch (e) {
    if (e instanceof Blocked) throw e;
    const detail = await makeAttempt();
    return `${detail} (passed on retry — host model variance)`;
  }
}

async function hostScenarios(): Promise<void> {
  const PROMPT = `relay this: fix the typo in hello.txt — 'teh' should be 'the'`;

  results.push(
    await runScenario("host cursor-agent: 'relay this' delegates via MCP", "host", () =>
      withRetry(async () => {
        const repo = makeRepo("host-cursor");
        // Headless cursor-agent loads project .cursor/rules but not the global
        // ~/.cursor/rules the IDE uses — install the same rule file relay setup
        // writes, so this tests the identical rule content end to end.
        const ruleSrc = join(homedir(), ".cursor", "rules", "relay.mdc");
        mkdirSync(join(repo, ".cursor", "rules"), { recursive: true });
        copyFileSync(ruleSrc, join(repo, ".cursor", "rules", "relay.mdc"));
        // Mainstream host model, like real Cursor sessions: nano-tier host
        // models (e.g. luna-low) skim their rules and do trivial tasks inline.
        const detail = await hostScenario(
          "cursor-agent",
          ["cursor-agent", "-p", PROMPT, "--model", "claude-sonnet-5-medium", "--output-format", "text", "--force"],
          repo,
          420_000,
        );
        return `${detail} (rule via project .cursor/rules — headless CLI skips global IDE rules)`;
      }),
    ),
  );

  results.push(
    await runScenario("host claude: 'relay this' delegates via MCP", "host", () =>
      withRetry(async () => {
      const repo = makeRepo("host-claude");
      return hostScenario(
        "claude",
        [
          "claude",
          "-p",
          PROMPT,
          "--model",
          "sonnet",
          "--allowedTools",
          "mcp__relay__relay_run,mcp__relay__relay_status",
        ],
        repo,
        420_000,
      );
      }),
    ),
  );

  results.push(
    await runScenario("host codex: 'relay this' delegates via MCP", "host", () =>
      withRetry(async () => {
        const repo = makeRepo("host-codex");
        return hostScenario(
          "codex",
          ["codex", "exec", "--sandbox", "workspace-write", PROMPT],
          repo,
          420_000,
        );
      }),
    ),
  );
}

function writeReport(): string {
  const lines: string[] = [];
  const ts = new Date().toISOString();
  const pass = results.filter((r) => r.status === "pass").length;
  const blocked = results.filter((r) => r.status === "blocked").length;
  lines.push(`# relay eval report`);
  lines.push("");
  lines.push(
    `Run: ${ts} · **${pass}/${results.length} passed**` +
      (blocked ? ` · ${blocked} blocked on environment (not product failures)` : ""),
  );
  lines.push("");
  lines.push(`| # | scenario | layer | result | time | detail |`);
  lines.push(`|---|----------|-------|--------|------|--------|`);
  const icon = { pass: "✅ pass", fail: "❌ FAIL", blocked: "⚠️ blocked" } as const;
  results.forEach((r, i) => {
    const detail = r.detail.replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(
      `| ${i + 1} | ${r.name} | ${r.layer} | ${icon[r.status]} | ${(r.ms / 1000).toFixed(0)}s | ${detail} |`,
    );
  });
  lines.push("");
  lines.push(
    `MCP-layer scenarios drive \`relay mcp serve\` over stdio with the same protocol hosts use; ` +
      `host-layer scenarios run the real CLIs headless with a "relay this:" prompt and assert the ` +
      `delegation actually happened (run record + fixed file). Each scenario uses a fresh scratch ` +
      `repo and isolated XDG dirs — nothing touches the developer's real state.`,
  );
  const out = lines.join("\n") + "\n";
  writeFileSync(join(ROOT, "evals", "report.md"), out);
  return out;
}

const t0 = Date.now();
await mcpScenarios();
if (WANT_HOSTS) await hostScenarios();
const report = writeReport();
console.log(report);
console.log(`total: ${((Date.now() - t0) / 60_000).toFixed(1)} min`);
process.exit(results.some((r) => r.status === "fail") ? 1 : 0);
