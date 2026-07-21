import { briefFromTask, parseBrief, type Brief } from "./brief.ts";
import { loadDirective, resolveTier, type Directive } from "./directive.ts";
import { routeTask } from "./route.ts";
import { assembleContext } from "./context/assemble.ts";
import { availableBackends, getBackend } from "./backends/index.ts";
import { runVerify } from "./verify.ts";
import { nextEscalation, type EscalationState } from "./escalate.ts";
import { loadPrices, makeReceipt, type Receipt } from "./savings.ts";
import {
  appendRun,
  hashTask,
  newRunId,
  type RunRecord,
} from "./runlog.ts";
import {
  createWorktree,
  listChangedFiles,
  maybeOpenDraftPr,
  stagePaths,
} from "./git.ts";

export type RunOpts = {
  cwd?: string;
  task: string;
  brief?: Brief | Record<string, unknown>;
  lane?: string;
  tier?: string;
  dryRun?: boolean;
  walkaway?: boolean;
  logTasks?: boolean;
  /** Force backend override (tests). */
  backendOverride?: string;
};

export type RunOutcome = {
  id: string;
  lane: string;
  tier: string;
  backend: string;
  model: string;
  reason: string;
  filesChanged: string[];
  verifyOk: boolean;
  escalations: number;
  receipt: Receipt | null;
  output: string;
  dryRun?: boolean;
  prUrl?: string | null;
};

export async function runTask(opts: RunOpts): Promise<RunOutcome> {
  if (process.env.RELAY_WORKER && !process.env.RELAY_ALLOW_NESTED) {
    throw new Error(
      "recursion guard: this process is already a relay worker — do the task directly instead of re-delegating (RELAY_ALLOW_NESTED=1 overrides)",
    );
  }
  const cwd = opts.cwd ?? process.cwd();
  const directive = loadDirective(cwd);
  const brief = normalizeBrief(opts);
  const decision = routeTask(directive, opts.task, {
    lane: opts.lane,
    tier: opts.tier,
    brief,
    walkaway: opts.walkaway,
  });

  // With an explicit backend override (tests), skip availability filtering.
  // Mutable during the run: a backend that hard-fails (auth, crash) is
  // dropped so retries re-resolve onto the next fallback candidate.
  const available = opts.backendOverride ? undefined : availableBackends();

  let tierName = decision.tier;
  let tier = resolveTier(directive, tierName, available);
  if (opts.backendOverride) {
    tier = { ...tier, backend: opts.backendOverride as typeof tier.backend };
  }

  if (opts.dryRun) {
    const context = await assembleContext(brief, {
      cwd,
      budgetChars: directive.context_budget_chars,
    });
    return {
      id: "dry-run",
      lane: decision.lane.name,
      tier: tierName,
      backend: tier.backend,
      model: tier.model,
      reason: decision.reason,
      filesChanged: [],
      verifyOk: true,
      escalations: 0,
      receipt: null,
      output: [
        `lane: ${decision.lane.name}`,
        `tier: ${tierName} → ${tier.backend}/${tier.model}` +
          (tier.fallback ? " (fallback — preferred backend not installed)" : ""),
        `write: ${decision.lane.write}`,
        `reason: ${decision.reason}`,
        `brief.goal: ${brief.goal}`,
        `context_chars: ${context.length}`,
      ].join("\n"),
      dryRun: true,
    };
  }

  const id = newRunId();
  const taskHash = hashTask(opts.task);
  const baseRecord = (): Omit<RunRecord, "status"> => ({
    id,
    ts: new Date().toISOString(),
    lane: decision.lane.name,
    backend: tier.backend,
    model: tier.model,
    tier: tierName,
    escalations: 0,
    task_hash: taskHash,
    cwd,
    ...(opts.logTasks ? { task: opts.task } : {}),
  });

  appendRun({ ...baseRecord(), status: "running" });

  let workCwd = cwd;
  let prUrl: string | null = null;
  if (decision.lane.write === "worktree") {
    const branch = `relay/${decision.lane.name}-${id.slice(-6)}`;
    workCwd = await createWorktree(cwd, branch);
  }

  let state: EscalationState = {
    attempts: 0,
    widened: false,
    tier: tierName,
    bumps: 0,
  };
  let lastOutput = "";
  let filesChanged: string[] = [];
  let verifyOk = false;
  let escalations = 0;
  let usage = undefined as RunOutcome extends never ? never : import("./backends/types.ts").Usage | undefined;
  let receipt: Receipt | null = null;

  while (true) {
    tierName = state.tier;
    try {
      tier = resolveTier(directive, tierName, available);
    } catch (e) {
      // escalation landed on a tier with no installed backend — stop here
      lastOutput += `\n\n[relay] ${(e as Error).message}`;
      break;
    }
    if (opts.backendOverride) {
      tier = { ...tier, backend: opts.backendOverride as typeof tier.backend };
    }

    const context = await assembleContext(brief, {
      cwd: workCwd,
      budgetChars: directive.context_budget_chars,
      widen: state.widened,
      namedFiles: brief.files,
    });
    const runBrief: Brief = { ...brief, context };

    // Snapshot the tree so we only attribute (and stage) files THIS run
    // touched — never the user's pre-existing uncommitted work.
    const preexisting = new Set(await listChangedFiles(workCwd));

    const backend = getBackend(tier.backend);
    const result = await backend.run(runBrief, {
      cwd: workCwd,
      model: tier.model,
      effort: tier.effort,
      write: decision.lane.write,
    });
    lastOutput = result.output;
    usage = result.usage;
    filesChanged = result.filesChanged.length
      ? result.filesChanged
      : (await listChangedFiles(workCwd)).filter((f) => !preexisting.has(f));

    if (
      (decision.lane.write === "stage" || decision.lane.write === "worktree") &&
      filesChanged.length > 0
    ) {
      await stagePaths(workCwd, filesChanged);
    }

    const verify = await runVerify(workCwd, directive, decision.lane.verify);
    verifyOk = verify.ok && result.exitCode === 0;

    if (verifyOk) break;

    // Backend-level failure (non-zero exit, nothing produced): the backend
    // itself is broken here (unauthenticated, crashed) — drop it and retry
    // the SAME tier on the next fallback candidate before escalating models.
    if (
      result.exitCode !== 0 &&
      filesChanged.length === 0 &&
      available?.has(tier.backend) &&
      available.size > 1
    ) {
      available.delete(tier.backend);
      try {
        resolveTier(directive, tierName, available);
        lastOutput += `\n\n[relay] backend ${tier.backend} failed (exit ${result.exitCode}) → trying next fallback backend`;
        continue;
      } catch {
        // no other backend can serve this tier — fall through to escalation
      }
    }

    const action = nextEscalation(directive, state);
    if (action.kind === "stop") {
      lastOutput += `\n\n[relay] ${action.reason}`;
      break;
    }

    escalations += 1;
    state = {
      attempts: state.attempts + 1,
      widened: state.widened || action.widen,
      tier: action.tier,
      bumps: action.tier !== state.tier ? state.bumps + 1 : state.bumps,
    };
    lastOutput += `\n\n[relay] ${action.reason}`;
  }

  if (verifyOk && decision.lane.write === "worktree") {
    prUrl = await maybeOpenDraftPr(
      workCwd,
      `relay: ${brief.goal.slice(0, 72)}`,
      `Automated by relay (lane=${decision.lane.name}, model=${tier.model}).\n\n${brief.goal}`,
    );
  }

  const prices = loadPrices(cwd);
  receipt = makeReceipt({
    prices,
    usedModel: tier.model,
    baselineModel: directive.baseline,
    usage,
  });

  appendRun({
    ...baseRecord(),
    status: verifyOk ? "ok" : "failed",
    backend: tier.backend,
    model: tier.model,
    tier: tierName,
    tokens_in: usage?.tokensIn,
    tokens_out: usage?.tokensOut,
    usage_estimated: usage?.estimated,
    verify_ok: verifyOk,
    escalations,
    saved_usd: receipt?.savedUsd,
    files_changed: filesChanged,
    error: verifyOk ? undefined : "verify failed or backend non-zero exit",
  });

  return {
    id,
    lane: decision.lane.name,
    tier: tierName,
    backend: tier.backend,
    model: tier.model,
    reason: decision.reason,
    filesChanged,
    verifyOk,
    escalations,
    receipt,
    output: lastOutput,
    prUrl,
  };
}

function normalizeBrief(opts: RunOpts): Brief {
  if (opts.brief) {
    if (typeof opts.brief === "object" && "goal" in opts.brief) {
      return parseBrief(opts.brief);
    }
  }
  return briefFromTask(opts.task);
}

export function formatOutcome(outcome: RunOutcome): string {
  if (outcome.dryRun) return outcome.output;
  const lines = [
    `→ lane: ${outcome.lane} · ${outcome.model} · verify: ${outcome.verifyOk ? "✓" : "✗"}` +
      (outcome.filesChanged.length
        ? ` · ${outcome.filesChanged.length} file(s) changed`
        : ""),
  ];
  if (outcome.escalations) lines.push(`  escalations: ${outcome.escalations}`);
  if (outcome.prUrl) lines.push(`  pr: ${outcome.prUrl}`);
  if (outcome.receipt) lines.push(outcome.receipt.line);
  return lines.join("\n");
}

export type { Directive };
