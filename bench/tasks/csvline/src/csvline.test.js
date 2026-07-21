const { test } = require("node:test");
const assert = require("node:assert");
const { parseCsvLine } = require("./csvline");

test("plain fields", () => {
  assert.deepStrictEqual(parseCsvLine("a,b,c"), ["a", "b", "c"]);
});
test("quoted field with comma", () => {
  assert.deepStrictEqual(parseCsvLine('a,"b,c",d'), ["a", "b,c", "d"]);
});
test("quotes are stripped", () => {
  assert.deepStrictEqual(parseCsvLine('"hello",world'), ["hello", "world"]);
});
