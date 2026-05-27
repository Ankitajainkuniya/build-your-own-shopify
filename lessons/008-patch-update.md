# Lesson 8 — Partial updates with PATCH

**Goal:** Support `PATCH /products/:id` for partial updates. Add the `updatedAt` field you wish you'd added on day one.

**Files:**

- `src/products/types.ts` (modified — added `updatedAt`)
- `src/products/seed.ts` (modified — backfilled `updatedAt`)
- `src/products/store.ts` (modified — added `update()`)
- `src/products/routes.ts` (modified — added `PATCH` route + `PatchBody` schema)

## PATCH vs PUT — pick a side

The HTTP spec has both, and the difference confuses many people:

- **`PUT /products/:id`** — *replace* the resource. The body is the entire new product. Anything you omit gets cleared.
- **`PATCH /products/:id`** — *partial* update. The body contains only the fields that change. Anything you omit is left alone.

Most modern APIs (Stripe, GitHub, Twilio) use PATCH because partial updates are 90% of real usage. Updating one field shouldn't require sending all 47. We go with PATCH.

Within PATCH, there are also two formal flavors:

- **JSON Merge Patch (RFC 7396)** — body shape mirrors the resource shape. `{ "title": "new" }` updates one field. `{ "title": null }` clears it. This is what we use.
- **JSON Patch (RFC 6902)** — body is an array of operations: `[{"op": "replace", "path": "/title", "value": "new"}]`. Powerful for arrays and nested structures but ugly for simple cases. Useful for collaborative editing (like Google Docs).

If you're not building a Google-Docs-style collaborative app, use Merge Patch. It's what your clients expect.

## What we changed in the store

```ts
update(id, patch) {
  const existing = items.get(id);
  if (!existing) return undefined;
  const next = { ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: new Date() };
  items.set(id, next);
  return next;
}
```

Three details that matter:

1. **`id` and `createdAt` are explicitly preserved.** Even if `patch` sneaks them in, we overwrite them with the original. The store is the last line of defense; the route's Zod schema is the first.
2. **`updatedAt` is set unconditionally on every update**, even if nothing actually changed. Some APIs only bump it when fields differ — that's marginally more accurate but harder to reason about. Pick a rule and stick with it.
3. **`{ ...existing, ...patch }` does deep-replace, not deep-merge.** For top-level fields, that's what we want. The day we add nested objects (variants, options), we'll need to think harder.

## `.strict()` on the Zod schema

```ts
const PatchBody = z.object({ ... }).strict();
```

Without `.strict()`, a client could send `{ "title": "new", "createdAt": "1970-01-01", "wat": 42 }` and Zod would silently ignore the unknown fields. Often that's fine — but on PATCH, where you're literally replacing a known set of fields, an unknown field is almost always a client bug. `.strict()` makes the validation reject unknown keys.

The downside: every new field you add to the type also needs to be added to the schema. Bug-versus-discoverability trade-off; we lean toward discoverability.

## Slug change requires re-checking uniqueness

```ts
if (patch.slug && patch.slug !== existing.slug) {
  const normalized = slugify(patch.slug);
  if (products.findBySlug(normalized) && /* not this product */) {
    throw Conflict(...);
  }
}
```

A PATCH that changes the slug must enforce the same constraint as a POST. Easy to forget — and the kind of thing that lesson notes catch better than tests do.

## What we deliberately skipped

- **Optimistic concurrency.** Two simultaneous PATCHes on the same product can clobber each other. Real solution: a `version` field + `If-Match: <etag>` header, return `412 Precondition Failed` on mismatch. Lesson 22 (when we have a real database).
- **Audit log.** "User X changed field Y from A to B at time T." Lesson 27.
- **Soft delete (`DELETE /products/:id`).** Soft vs hard delete, restore, GC. Lesson 11.

## Try it

```bash
# Update just the price
curl -X PATCH localhost:3000/products/p_1 \
  -H 'content-type: application/json' \
  -d '{"priceCents":7500}'

# Watch updatedAt change but createdAt stay
curl localhost:3000/products/p_1
```

## Exercises

1. Send a PATCH with `{ "id": "p_HACKER" }`. Verify the id doesn't change. Why does this work given the Zod schema?
2. Two PATCH requests in quick succession with different `inventory` values. The second wins. Implement a `version` field on Product, increment on every update, and reject PATCHes whose body has the wrong version. (Spoiler: this is what lesson 22 does, but try it now.)
3. The PATCH route reuses `slugify()` on user-supplied slugs. Why is that important even though the POST route also does it? Hint: think about clients that pass through user input differently between the two endpoints.

## Next

Lesson 9 — Pagination. Why `?offset=10000` is a footgun and why cursors are the answer.
