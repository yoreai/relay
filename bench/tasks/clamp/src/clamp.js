// clamp(value, min, max)
function clamp(value, min, max) {
  return Math.min(min, Math.max(max, value));
}
module.exports = { clamp };
