import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { formatOutcome, runTask } from "./run.ts";
import { getRun, readRuns, summarizeSavings } from "./runlog.ts";
import { briefFromTask, parseBrief } from "./brief.ts";
import { RELAY_VERSION } from "./version.ts";

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
          "context) — you already understand the problem, so a good brief makes the cheap run succeed first try.",
        inputSchema: {
          type: "object",
          properties: {
            task: { type: "string", description: "Plain-English task" },
            brief: {
              type: "object",
              description: "Optional curated brief {goal, why, files, constraints, done_means, context}",
            },
            lane: { type: "string" },
            wait: {
              type: "boolean",
              description: "If false, return run id immediately (fire-and-poll). Default true.",
            },
          },
          required: ["task"],
        },
      },
      {
        name: "relay_status",
        description: "Status for a run id, or recent runs if omitted.",
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
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;

    try {
      if (name === "relay_run") {
        const task = String(args.task ?? "");
        if (!task) throw new Error("task is required");
        const wait = args.wait !== false;
        const brief = args.brief
          ? parseBrief(args.brief)
          : briefFromTask(task);

        if (!wait) {
          // fire-and-poll: start without awaiting full completion in the tool reply path
          // For v1 we still await — true background needs a worker. Return after schedule via promise.
          const pending = runTask({
            task,
            brief,
            lane: args.lane ? String(args.lane) : undefined,
          });
          // race a quick id by running synchronously until running log — simplest: await
          const outcome = await pending;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    id: outcome.id,
                    summary: formatOutcome(outcome),
                    filesChanged: outcome.filesChanged,
                    receipt: outcome.receipt,
                    verifyOk: outcome.verifyOk,
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
          brief,
          lane: args.lane ? String(args.lane) : undefined,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  id: outcome.id,
                  summary: formatOutcome(outcome),
                  filesChanged: outcome.filesChanged,
                  receipt: outcome.receipt,
                  verifyOk: outcome.verifyOk,
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
          return {
            content: [
              {
                type: "text",
                text: run ? JSON.stringify(run, null, 2) : `no run ${id}`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(readRuns(20), null, 2),
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
