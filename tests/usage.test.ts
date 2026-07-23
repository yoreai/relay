import { describe, expect, test } from "bun:test";
import {
  assistantTextFromStream,
  parseStreamUsage,
} from "../src/backends/types.ts";

// Real event shapes captured from live CLIs — keep in sync if they change.
const CURSOR_STREAM = [
  `{"type":"system","subtype":"init","cwd":"/tmp","session_id":"s1","model":"GLM 5.2 High"}`,
  `{"type":"user","message":{"role":"user","content":[{"type":"text","text":"do the thing"}]},"session_id":"s1"}`,
  `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"done, edited one file"}]},"session_id":"s1"}`,
  `{"type":"result","subtype":"success","duration_ms":2405,"is_error":false,"result":"ok","session_id":"s1","usage":{"inputTokens":3,"outputTokens":5,"cacheReadTokens":13872,"cacheWriteTokens":2701}}`,
].join("\n");

const CLAUDE_STREAM = [
  `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"patched"}]}}`,
  `{"type":"result","subtype":"success","usage":{"input_tokens":120,"output_tokens":450,"cache_read_input_tokens":9000}}`,
].join("\n");

describe("parseStreamUsage", () => {
  test("reads cursor-agent result usage (camelCase + cache reads)", () => {
    const u = parseStreamUsage(CURSOR_STREAM);
    expect(u).toEqual({
      tokensIn: 3,
      tokensOut: 5,
      tokensCacheRead: 13872,
      estimated: false,
    });
  });

  test("reads claude result usage (snake_case)", () => {
    const u = parseStreamUsage(CLAUDE_STREAM);
    expect(u).toEqual({
      tokensIn: 120,
      tokensOut: 450,
      tokensCacheRead: 9000,
      estimated: false,
    });
  });

  test("returns null when no usage event exists", () => {
    expect(parseStreamUsage("plain error text\nno json here")).toBeNull();
    expect(parseStreamUsage(`{"type":"assistant","message":{}}`)).toBeNull();
  });
});

describe("assistantTextFromStream", () => {
  test("extracts only assistant-visible text, not event envelopes", () => {
    const text = assistantTextFromStream(CURSOR_STREAM);
    expect(text).toBe("done, edited one file");
    // the raw stream is ~10x larger — this is why estimating from it inflated receipts
    expect(text.length).toBeLessThan(CURSOR_STREAM.length / 10);
  });

  test("empty when the stream has no assistant text", () => {
    expect(assistantTextFromStream("nope")).toBe("");
  });
});
