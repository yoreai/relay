const { test } = require("node:test");
const assert = require("node:assert");
const { formatDuration } = require("./duration");

test("hours minutes seconds", () => {
  assert.strictEqual(formatDuration(3725), "1h 02m 05s");
});
test("zero hours", () => {
  assert.strictEqual(formatDuration(65), "0h 01m 05s");
});
test("exact hour", () => {
  assert.strictEqual(formatDuration(7200), "2h 00m 00s");
});
