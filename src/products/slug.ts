/**
 * Convert a human title into a URL-safe slug.
 *
 *   "Linen Shirt"        → "linen-shirt"
 *   "Crème Brûlée"       → "creme-brulee"     (diacritics stripped)
 *   "iPhone 15 Pro Max!" → "iphone-15-pro-max"
 *   "   spaces   "       → "spaces"
 *
 * Not bijective: two different titles can produce the same slug
 * (that's the caller's problem to handle — see lesson 7).
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
