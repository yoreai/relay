const { test } = require("node:test");
const assert = require("node:assert");
const { slugify } = require("./slugify");

test("lowercases and dashes", () => {
  assert.strictEqual(slugify("Hello World"), "hello-world");
});
test("strips punctuation", () => {
  assert.strictEqual(slugify("Agents, Routed!"), "agents-routed");
});
test("collapses whitespace", () => {
  assert.strictEqual(slugify("a   b\tc"), "a-b-c");
});
