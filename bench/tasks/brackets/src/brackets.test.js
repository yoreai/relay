const { test } = require("node:test");
const assert = require("node:assert");
const { isBalanced } = require("./brackets");

test("balanced nesting", () => {
  assert.strictEqual(isBalanced("([]{()})"), true);
});
test("wrong close type fails", () => {
  assert.strictEqual(isBalanced("(]"), false);
});
test("close without open fails", () => {
  assert.strictEqual(isBalanced(")("), false);
});
test("unclosed fails", () => {
  assert.strictEqual(isBalanced("((("), false);
});
