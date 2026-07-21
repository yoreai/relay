// formatDuration(totalSeconds) -> "1h 02m 05s" (zero-padded mins/secs)
function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s`;
}
module.exports = { formatDuration };
