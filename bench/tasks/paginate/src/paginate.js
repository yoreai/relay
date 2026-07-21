// paginate(items, page, perPage): page is 1-indexed
function paginate(items, page, perPage) {
  const start = page * perPage;
  return items.slice(start, start + perPage);
}
module.exports = { paginate };
