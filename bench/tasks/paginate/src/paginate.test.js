const { test } = require("node:test");
const assert = require("node:assert");
const { paginate } = require("./paginate");

const items = [1, 2, 3, 4, 5, 6, 7];

test("page 1 returns first items", () => {
  assert.deepStrictEqual(paginate(items, 1, 3), [1, 2, 3]);
});
test("page 2 continues", () => {
  assert.deepStrictEqual(paginate(items, 2, 3), [4, 5, 6]);
});
test("last partial page", () => {
  assert.deepStrictEqual(paginate(items, 3, 3), [7]);
});
