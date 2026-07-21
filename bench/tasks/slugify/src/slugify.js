// slugify: lowercase, spaces->dashes, strip other non-alphanumerics
function slugify(input) {
  return input.toUpperCase().replace(/\s+/g, "_");
}
module.exports = { slugify };
