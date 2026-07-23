import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanUserText, recentSessions } from "../src/transcripts.ts";

const REPO = "/Users/dev/proj";

/** Fixture home dir mirroring each host's real on-disk session layout. */
function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), "relay-thome-"));

  // cursor: projects/<slug>/agent-transcripts/<id>/<id>.jsonl
  const cid = "aaaa-bbbb";
  const cdir = join(home, ".cursor", "projects", "Users-dev-proj", "agent-transcripts", cid);
  mkdirSync(cdir, { recursive: true });
  writeFileSync(
    join(cdir, `${cid}.jsonl`),
    [
      JSON.stringify({
        role: "user",
        message: {
          content: [
            {
              type: "text",
              text: "<timestamp>x</timestamp>\n<user_query>\nplease refactor the auth module\n</user_query>",
            },
          ],
        },
      }),
      JSON.stringify({ role: "assistant", message: { content: [{ type: "text", text: "done" }] } }),
      "{corrupt",
      JSON.stringify({
        role: "user",
        message: { content: [{ type: "text", text: "<user_query>ship it</user_query>" }] },
      }),
    ].join("\n"),
  );

  // claude: projects/<munged>/<session>.jsonl (leading dash preserved)
  const cldir = join(home, ".claude", "projects", "-Users-dev-proj");
  mkdirSync(cldir, { recursive: true });
  writeFileSync(
    join(cldir, "s1.jsonl"),
    [
      JSON.stringify({ type: "mode", mode: "normal" }),
      JSON.stringify({ type: "user", message: { role: "user", content: "fix the login bug" } }),
      JSON.stringify({
        type: "user",
        message: { role: "user", content: [{ type: "tool_result", content: "…" }] },
      }),
    ].join("\n"),
  );

  // codex: sessions/YYYY/MM/DD/rollout-*.jsonl with cwd in session_meta
  const codir = join(home, ".codex", "sessions", "2026", "07", "23");
  mkdirSync(codir, { recursive: true });
  writeFileSync(
    join(codir, "rollout-match.jsonl"),
    [
      JSON.stringify({ type: "session_meta", payload: { cwd: REPO } }),
      JSON.stringify({
        type: "event_msg",
        payload: { type: "user_message", message: "add pagination to the API" },
      }),
      JSON.stringify({
        type: "event_msg",
        payload: { type: "user_message", message: "[relay worker] You are relay's delegated worker. Do X." },
      }),
    ].join("\n"),
  );
  writeFileSync(
    join(codir, "rollout-other.jsonl"),
    [
      JSON.stringify({ type: "session_meta", payload: { cwd: "/some/other/repo" } }),
      JSON.stringify({
        type: "event_msg",
        payload: { type: "user_message", message: "must not appear" },
      }),
    ].join("\n"),
  );

  return home;
}

describe("recentSessions", () => {
  test("extracts user asks from all three hosts, filtered to this repo", () => {
    const sessions = recentSessions(REPO, { home: makeHome() });
    const hosts = sessions.map((s) => s.host).sort();
    expect(hosts).toEqual(["claude", "codex", "cursor"]);

    const all = sessions.flatMap((s) => s.messages).join(" | ");
    expect(all).toContain("please refactor the auth module");
    expect(all).toContain("ship it");
    expect(all).toContain("fix the login bug");
    expect(all).toContain("add pagination to the API");
    // other repos and relay's own worker prompts never leak
    expect(all).not.toContain("must not appear");
    expect(all).not.toContain("relay worker");
  });

  test("missing home dirs and unknown repos degrade to empty, never throw", () => {
    expect(recentSessions("/nope", { home: makeHome() })).toEqual([]);
    expect(recentSessions(REPO, { home: mkdtempSync(join(tmpdir(), "relay-empty-")) })).toEqual([]);
  });

  test("stale sessions are skipped", () => {
    const home = makeHome();
    const future = Date.now() + 30 * 86_400_000; // pretend a month passed
    expect(recentSessions(REPO, { home, now: future })).toEqual([]);
  });
});

describe("cleanUserText", () => {
  test("unwraps user_query and strips metadata tags (nested included)", () => {
    expect(cleanUserText("<ts>x</ts>\n<user_query>do the thing</user_query>")).toBe("do the thing");
    expect(
      cleanUserText("<task-notification> <task-id>abc</task-id> </task-notification>"),
    ).toBe("");
  });

  test("drops relay probe/worker noise and tool-result turns", () => {
    expect(cleanUserText("say only: ok")).toBe("");
    expect(cleanUserText("reply with exactly: ok")).toBe("");
    expect(cleanUserText("[relay worker] execute this")).toBe("");
    expect(cleanUserText("Caveat: the messages below were generated…")).toBe("");
  });
});
