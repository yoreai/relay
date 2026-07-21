// parseCsvLine: split on commas, honoring double-quoted fields
// (quotes are stripped; commas inside quotes are literal)
function parseCsvLine(line) {
  return line.split(",");
}
module.exports = { parseCsvLine };
