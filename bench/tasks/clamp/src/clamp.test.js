const { test } = require("node:test");
const assert = require("node:assert");
const { clamp } = require("./clamp");

test("inside range unchanged", () => {
  assert.strictEqual(clamp(5, 0, 10), 5);
});
test("below min clamps to min", () => {
  assert.strictEqual(clamp(-3, 0, 10), 0);
});
test("above max clamps to max", () => {
  assert.strictEqual(clamp(42, 0, 10), 10);
});
