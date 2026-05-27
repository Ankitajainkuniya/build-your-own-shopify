# Lesson 7 — Slugs, properly

**Goal:** Auto-generate URL-safe slugs from product titles. Enforce uniqueness. Surface conflicts as `409 Conflict`. Expose a lookup endpoint `GET /products/by-slug/:slug`.

**Files:**

- `src/products/slug.ts` (new — slugify utility)
- `src/products/store.ts` (modified — added `findBySlug`)
- `src/products/routes.ts` (modified — slug derivation, conflict handling, new lookup route)

## What slugify actually has to do

```ts
slugify("Linen Shirt")          // "linen-shirt"
slugify("Crème Brûlée")          // "creme-brulee"      ← diacritics stripped
slugify("iPhone 15 Pro Max!")    // "iphone-15-pro-max"  ← punctuation gone
slugify("    spaces    ")        // "spaces"             ← trimmed + collapsed
slugify("---")                   // ""                   ← edge case! we reject this
```

The implementation is small but easy to get subtly wrong:

```ts
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")              // decompose à into "a" + combining accent
    .replace(/[̀-ͯ]/g, "")            // strip the combining accents
    .replace(/[^a-z0-9]+/g, "-")    // any run of non-alphanumeric → single hyphen
    .replace(/^-+|-+$/g, "")        // trim leading/trailing hyphens
    .slice(0, 80);                   // bound the length
}
```

Three things that look optional but aren't:

1. **NFKD normalization.** Without this, `é` stays as one code point and never gets stripped. With it, `é` becomes `e` + combining accent, and the next line removes the combining mark.
2. **Empty result handling.** `slugify("---")` returns `""`. If you blindly use that as a URL, you get `/products/by-slug/` — a broken route. Catch it in the caller and 400.
3. **Length cap.** Without `slice(0, 80)`, someone posts a 50,000-character title and you store a 50,000-character slug. Then your database index on slugs blows up.

## Uniqueness without a real database

We don't have unique constraints yet (lesson 21 introduces SQLite), so we enforce uniqueness in code:

```ts
if (products.findBySlug(desiredSlug)) {
  throw Conflict("slug already in use", { slug: desiredSlug });
}
```

This is **not race-safe**. Two simultaneous POSTs with the same title can both see "slug doesn't exist", both proceed, both insert. We'll come back to this in lesson 22 with a real `UNIQUE` constraint and a retry loop. For now, single-process in-memory, it's fine.

## 409 Conflict — what it actually means

> The request could not be completed due to a conflict with the current state of the target resource. This code is used in situations where the user might be able to resolve the conflict and resubmit the request.

Two distinct flavors that often get conflated:

- **Duplicate-key conflict** (this case). The client should try a different slug. Status code: `409`.
- **Optimistic concurrency conflict** ("you read v3, you're writing v4, but it's now v5"). The client should re-read and retry. Status code: `409` with an `ETag` mismatch.

Both are 409. The body should make clear which it is. We return `details: { slug: "..." }` so the client can suggest an alternative.

## Slug history (and why we're skipping it)

A real store changes product titles. "Linen Shirt" gets renamed to "Linen Button-Down". The slug rightly becomes `linen-button-down`. But what about the customer who bookmarked `/products/by-slug/linen-shirt`? Or worse — the customer's Pinterest link? Or Google's index?

Shopify, Amazon, and friends handle this with **slug history** — a separate `slug_aliases` table tracking every slug a product has ever had. Old slugs `301 Permanent Redirect` to the canonical current URL.

We won't build this. It's a great Module 1 exercise but the lesson note is enough until we have a database in lesson 21.

## What we deliberately skipped

- **Slug history / redirects.** As above.
- **Multilingual slugs.** Korean / Japanese / Arabic titles produce empty slugs with this implementation. A real product would either keep transliteration (e.g. via `transliteration` npm) or accept Unicode slugs (modern, debated). Open question; we'll punt to a future module.
- **Reserved slugs.** `/products/by-slug/admin` should probably not resolve to a product. Maintain a denylist.

## Try it

```bash
# create one
curl -X POST localhost:3000/products -H 'content-type: application/json' \
  -d '{"title":"Crème Brûlée Spoon","priceCents":1200,"currency":"USD"}'
# → slug: creme-brulee-spoon

# look it up by slug
curl localhost:3000/products/by-slug/creme-brulee-spoon

# try to create another with the same slug
curl -X POST localhost:3000/products -H 'content-type: application/json' \
  -d '{"title":"Crème Brûlée Spoon","priceCents":1500,"currency":"USD"}'
# → 409 Conflict
```

## Exercises

1. Add a `?title=…` query param to `POST /products` simulation — no, just write a test that submits the same title twice and asserts the second returns 409.
2. Implement a `getOrCreate` helper: if the slug exists, append `-2`, `-3`, ... until one is free. Should this be the default behavior or opt-in?
3. The `findBySlug` method walks every product. With 100k products this is O(n). Add a second `Map<slug, id>` index inside the store and keep it in sync. What invariant do you have to maintain?

## Next

Lesson 8 — `PATCH /products/:id`. Partial updates, JSON Merge Patch, and the `updatedAt` field that you wish you'd added on day one.
