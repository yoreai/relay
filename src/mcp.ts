import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { formatOutcome, runTask } from "./run.ts";
import {
  appendEvent,
  getRun,
  readEvents,
  readRuns,
  summarizeSavings,
} from "./runlog.ts";
import { briefFromTask, parseBrief } from "./brief.ts";
import { freshnessHint } from "./freshness.ts";
import { probeTools, runLogin } from "./probe.ts";
import { listBackendChoices, runBackendsCommand } from "./backends_cmd.ts";
import { RELAY_VERSION } from "./version.ts";

function resolveRunCwd(raw: string): string {
  if (!isAbsolute(raw)) {
    throw new Error(`cwd must be an absolute path, got: ${raw}`);
  }
  try {
    if (!statSync(raw).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error(`cwd does not exist or is not a directory: ${raw}`);
  }
  return raw;
}

/**
 * Found in the wild: a host omitted cwd and the run executed from the MCP
 * server's own working directory (the user's home) — file-change tracking,
 * staging, and verify all watched the wrong place while the worker edited
 * the real repo via absolute paths. Refuse to default to a non-repo dir.
 */
export function requireRunCwd(explicit: string | undefined): string {
  if (explicit) return explicit;
  const cwd = process.cwd();
  const isRepo = (dir: string): boolean => {
    for (let d = dir; ; ) {
      if (existsSync(join(d, ".git"))) return true;
      const parent = join(d, "..");
      if (parent === d) return false;
      d = parent;
    }
  };
  if (cwd === homedir() || cwd === "/" || !isRepo(cwd)) {
    throw new Error(
      `relay_run: pass cwd (absolute path to the workspace root). ` +
        `This MCP server is running from ${cwd}, which is not a project repository — ` +
        `running there would track changes in the wrong place. Retry with the cwd argument.`,
    );
  }
  return cwd;
}

export async function serveMcp(): Promise<void> {
  const server = new Server(
    { name: "relay", version: RELAY_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "relay_run",
        description:
          "Delegate a sub-task to the cheapest model that clears its quality bar. " +
          "Ideal for mechanical work mid-session (bulk edits, test fixes, renames, summaries, status checks) " +
          "so the expensive session doesn't burn frontier tokens on it. Relay routes via the user's directive, " +
          "runs a headless backend in the repo, verifies the result (escalating only on failure), leaves edits " +
          "staged in git, and returns a savings receipt. Pass a curated brief (goal, files, constraints, done_means, " +
          "context) — you already understand the problem, so a good brief makes the cheap run succeed first try. " +
          "ALWAYS pass cwd (absolute path to the repo/workspace root the task concerns) — the server may have been " +
          "launched from a different directory.",
        inputSchema: {
          type: "object",
          properties: {
            task: { type: "string", description: "Plain-English task" },
            cwd: {
              type: "string",
              description:
                "Absolute path to the repo/workspace root to run in. Required in practice: without it the task runs in the MCP server's own working directory, which is often not your project.",
            },
            brief: {
              type: "object",
              description:
                "Optional curated brief. A good brief makes the cheap model succeed first try.",
              properties: {
                goal: { type: "string" },
                why: { type: "string" },
                files: { type: "array", items: { type: "string" } },
                constraints: { type: "array", items: { type: "string" } },
                done_means: { type: "array", items: { type: "string" } },
                context: { type: "string" },
              },
            },
            lane: { type: "string" },
            wait: {
              type: "boolean",
              description:
                "Default true (block until done). For long tasks (builds, multi-file work), pass false: " +
                "returns {id} immediately while the run continues in the background — then poll relay_status " +
                "with that id every ~30s and recap the phase to the user so they can follow along.",
            },
          },
          required: ["task"],
        },
      },
      {
        name: "relay_status",
        description:
          "Status for a run id (includes a phase-by-phase progress feed — routed, working, verifying, " +
          "escalating, done), or recent runs if id is omitted. Poll this during long relay_run calls and " +
          "narrate progress to the user.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      },
      {
        name: "relay_savings",
        description: "Cumulative savings summary from local runs.jsonl.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "relay_doctor",
        description:
          "Probe which AI coding CLIs exist on this machine and whether each is signed in for background runs. " +
          "Use before delegating (or when a run fails with an auth error) to know what to fix. " +
          "Returns plain-language status per tool plus machine-runnable fixes; pass fresh=true to bypass the 24h auth cache.",
        inputSchema: {
          type: "object",
          properties: {
            fresh: { type: "boolean", description: "re-run auth probes now" },
          },
        },
      },
      {
        name: "relay_backends",
        description:
          "List or change which installed CLIs relay may route work to (machine-local; e.g. an org that " +
          "hasn't approved a tool). With no arguments, lists each backend's installed/enabled state. " +
          "Only enable/disable when the user explicitly asks — this is their policy choice, not yours.",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["list", "enable", "disable"],
              description: "Default list.",
            },
            tool: {
              type: "string",
              description: "cursor | claude | codex | gemini | grok | kimi (required for enable/disable)",
            },
          },
        },
      },
      {
        name: "relay_login",
        description:
          "Run a tool's sign-in flow on the user's machine (pops their browser where the CLI supports it, e.g. cursor/codex). " +
          "Call when relay_doctor reports a tool 'needs a one-time sign-in'. Tell the user a browser window may open. " +
          "Tools needing an interactive terminal (claude) return instructions instead.",
        inputSchema: {
          type: "object",
          properties: {
            tool: {
              type: "string",
              description: "cursor | claude | codex | gemini | grok | kimi",
            },
          },
          required: ["tool"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;

    // Live progress for hosts that pass a progressToken (best-effort; the
    // polling path via relay_status works everywhere regardless).
    const progressToken = req.params._meta?.progressToken;
    let progressCount = 0;
    const notifyProgress =
      progressToken !== undefined
        ? (phase: string, detail?: string) => {
            progressCount += 1;
            void extra
              .sendNotification({
                method: "notifications/progress",
                params: {
                  progressToken,
                  progress: progressCount,
                  message: detail ? `relay: ${phase} — ${detail}` : `relay: ${phase}`,
                },
              })
              .catch(() => {});
          }
        : undefined;

    try {
      if (name === "relay_run") {
        if (process.env.RELAY_WORKER) {
          throw new Error(
            "recursion guard: you are already relay's delegated worker — execute the task directly instead of calling relay_run",
          );
        }
        const task = String(args.task ?? "");
        if (!task) throw new Error("task is required");
        const cwd = requireRunCwd(
          args.cwd ? resolveRunCwd(String(args.cwd)) : undefined,
        );
        const wait = args.wait !== false;
        const brief = args.brief
          ? parseBrief(args.brief)
          : briefFromTask(task);

        if (!wait) {
          // True fire-and-poll: resolve as soon as the run id exists; the run
          // continues in this server process and persists progress to the
          // event log, where relay_status picks it up.
          const id = await new Promise<string>((resolve, reject) => {
            let runId: string | undefined;
            runTask({
              task,
              cwd,
              brief,
              lane: args.lane ? String(args.lane) : undefined,
              onStart: (allocated) => {
                runId = allocated;
                resolve(allocated);
              },
              onEvent: notifyProgress,
            }).catch((e) => {
              // Before the id exists (routing/guard errors): surface to the
              // caller. After: log it so pollers see the run die, not hang.
              if (runId) appendEvent(runId, "failed", (e as Error).message);
              else reject(e as Error);
            });
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    id,
                    status: "running",
                    next: `poll relay_status with id "${id}" (~30s cadence) and recap progress to the user`,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const outcome = await runTask({
          task,
          cwd,
          brief,
          lane: args.lane ? String(args.lane) : undefined,
          onEvent: notifyProgress,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  id: outcome.id,
                  summary: formatOutcome(outcome),
                  cwd: cwd ?? process.cwd(),
                  filesChanged: outcome.filesChanged,
                  receipt: outcome.receipt,
                  verifyOk: outcome.verifyOk,
                  ...(outcome.workBranch
                    ? {
                        work_branch: outcome.workBranch,
                        work_dir: outcome.workDir,
                        pr_url: outcome.prUrl ?? undefined,
                        reconcile:
                          "Work is committed on that branch — it does NOT auto-merge. " +
                          "Tell the user where it landed, offer to review the diff, and merge only when they approve " +
                          `(\`git merge ${outcome.workBranch}\`, then \`git worktree remove ${outcome.workDir}\` and delete the branch).`,
                      }
                    : {}),
                  outputTail: outcome.output.slice(-2_000),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (name === "relay_status") {
        const id = args.id ? String(args.id) : undefined;
        if (id) {
          const run = getRun(id);
          if (!run) {
            return { content: [{ type: "text", text: `no run ${id}` }] };
          }
          const events = readEvents(id);
          const current = events.at(-1);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    ...run,
                    ...(current ? { phase: current.phase, phase_detail: current.detail } : {}),
                    progress: events,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
        const hint = await freshnessHint();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { runs: readRuns(20), ...(hint ? { update_hint: hint } : {}) },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (name === "relay_savings") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(summarizeSavings(), null, 2),
            },
          ],
        };
      }

      if (name === "relay_doctor") {
        const tools = await probeTools({ fresh: args.fresh === true });
        const hint = await freshnessHint();
        const choices = new Map(listBackendChoices().map((c) => [c.backend, c.enabled]));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  tools: tools.map((t) => ({
                    tool: t.id,
                    label: t.label,
                    installed: t.cliPresent,
                    app_detected: t.appDetected,
                    signed_in: t.authed,
                    enabled_for_relay: choices.get(t.id) ?? true,
                    status: t.summary,
                    fix:
                      t.cliPresent && t.authed === false
                        ? `call relay_login with tool="${t.id}"` +
                          (t.login?.interactive ? ` — but note: ${t.login.note}` : "")
                        : !t.cliPresent && t.appDetected
                          ? t.install
                          : undefined,
                  })),
                  ...(hint
                    ? {
                        update_hint: hint,
                        update_hint_note:
                          "relay never phones home — this comes from a cached (24h) pull of the public catalog/release on GitHub. Suggest the fix command to the user when convenient.",
                      }
                    : {}),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (name === "relay_backends") {
        const action = args.action ? String(args.action) : "list";
        if (action === "list") {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ backends: listBackendChoices() }, null, 2),
              },
            ],
          };
        }
        const tool = String(args.tool ?? "");
        const result = runBackendsCommand([action, tool]);
        return {
          content: [{ type: "text", text: result }],
          isError: result.startsWith("usage:") || result.startsWith("unknown"),
        };
      }

      if (name === "relay_login") {
        const result = await runLogin(String(args.tool ?? ""));
        return {
          content: [{ type: "text", text: result.message }],
          isError: !result.ok,
        };
      }

      throw new Error(`unknown tool ${name}`);
    } catch (e) {
      return {
        content: [{ type: "text", text: `error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
