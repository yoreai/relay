// isBalanced: are ()[]{} balanced and correctly nested?
function isBalanced(s) {
  const pairs = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  for (const ch of s) {
    if ("([{".includes(ch)) stack.push(ch);
    else if (ch in pairs) stack.pop();
  }
  return stack.length === 0;
}
module.exports = { isBalanced };
