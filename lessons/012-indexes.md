# Lesson 12 — In-memory indexes (a preview of what your database does)

**Goal:** Make `findBySlug` and tag filtering O(1) instead of O(n). Maintain the index invariants on every mutation. See firsthand what a database query planner is doing for you behind the scenes.

**Files:**

- `src/products/store.ts` (modified — added `slugIndex` and `tagIndex`, with `_addToIndexes` / `_removeFromIndexes` helpers)
- `src/products/routes.ts` (modified — tag filter now starts from the index, not a full scan)

## The problem

Before this lesson:

```ts
findBySlug(slug) {
  for (const p of items.values()) {        // O(n)
    if (p.slug === slug) return p;
  }
}
// Tag filter:
products.list().filter(p => p.tags.includes(tag))   // O(n × avg_tags)
```

With 10 products this is invisible. With 100,000 products and 50 requests per second, you're doing 5,000,000 string comparisons per second just to look up slugs. At that point your in-memory store is the bottleneck.

## The fix

Add a side-map keyed by the thing you query:

```ts
const slugIndex = new Map<string, string>();           // slug → id
const tagIndex  = new Map<string, Set<string>>();      // tag → Set<id>
```

Now:

```ts
findBySlug(slug) {
  const id = slugIndex.get(slug);                       // O(1)
  return id ? items.get(id) : undefined;
}

findByTag(tag) {
  const bucket = tagIndex.get(tag);                     // O(1)
  return bucket ? Array.from(bucket).map(id => items.get(id)) : [];
}
```

This is *literally* what a database does when you `CREATE INDEX ON products(slug)`. The query planner knows the index exists, looks up the id, then fetches the row. Same data structure, just persisted on disk.

## The invariant: indexes follow the data

The hard part of indexes isn't the lookup. It's keeping them in sync.

**Every mutation must update every relevant index.** Forget once, and `findBySlug` returns stale data forever.

```ts
function _addToIndexes(p) {
  slugIndex.set(p.slug, p.id);
  for (const tag of p.tags) {
    const bucket = tagIndex.get(tag) ?? new Set();
    bucket.add(p.id);
    tagIndex.set(tag, bucket);
  }
}

function _removeFromIndexes(p) {
  if (slugIndex.get(p.slug) === p.id) slugIndex.delete(p.slug);
  for (const tag of p.tags) {
    const bucket = tagIndex.get(tag);
    if (bucket) {
      bucket.delete(p.id);
      if (bucket.size === 0) tagIndex.delete(tag);
    }
  }
}
```

Now in `update()`:

```ts
update(id, patch) {
  const existing = items.get(id);
  if (!existing) return undefined;
  _removeFromIndexes(existing);                         // pull old shape out
  const next = { ...existing, ...patch, updatedAt: new Date() };
  items.set(id, next);
  _addToIndexes(next);                                  // put new shape in
  return next;
}
```

The pattern: remove-then-add. *Not* "diff and selectively patch" — that's harder to get right and the saving is tiny for our scale.

## What about soft-deleted rows?

A soft-deleted product *stays in the index*. Two reasons:

1. **Slug ownership.** If you delete a product with slug `mug`, then create a new product with slug `mug`, then restore the old one — both would try to own `mug`. Bad. We keep the slug "occupied" by the deleted product.
2. **Cheap to filter.** The lookup is `slugIndex.get(slug)` → `items.get(id)` → `deletedAt === null ? p : undefined`. Two hash lookups + a boolean check. Still O(1).

This decision goes the other way for some data types — for example, indexed search of *visible* products would want a separate `visibleSlugIndex`. The principle: **indexes follow access patterns, not data structure**.

## Why route the tag filter through the index

Before:

```ts
products.list()
  .filter(p => p.tags.includes(tag))            // every product, every time
  .filter(currencyFilter)
  .filter(inStockFilter)
  .filter(priceFilter)
```

After:

```ts
products.findByTag(tag)                          // start with smaller candidate set
  .filter(currencyFilter)
  .filter(inStockFilter)
  .filter(priceFilter)
```

The first filter is the most selective: it drops 90%+ of the rows. The rest of the filters operate on a much smaller set. This is "predicate pushdown" — exactly what a real query planner picks for you when you have a `WHERE tag = 'sale' AND currency = 'USD' AND in_stock = true`.

Order of filters matters when one is dramatically more selective than the others. SQLite, Postgres, Mongo all do this. Here we do it by hand.

## What we deliberately skipped

- **Multi-column indexes.** `(currency, tag)` as one index. Real databases support these; we don't (yet).
- **Partial indexes.** "Only index live products" — would save memory at the cost of bookkeeping complexity. Lesson 25.
- **Index invalidation on `restore`.** Currently restore doesn't touch indexes. Should it? Trace through and find out — the answer is no for the current shape, yes if `findByTag` was filtering deleted out at index-time instead of lookup-time. Don't change behavior unless tests force it.
- **Concurrent mutations.** Two mutations to the same product happening interleaved would corrupt the indexes. Lesson 22 introduces the transactional view.

## Try it

There's no observable behavior change — the tests from lesson 11 still pass — but the perf characteristics are different. To feel it:

```bash
# in node REPL:
# for (let i = 0; i < 100000; i++) {
#   fetch(`http://localhost:3000/products?title=junk${i}&priceCents=1&currency=USD`, {method:'POST', ...});
# }
# then time
# time curl 'localhost:3000/products/by-slug/junk-99999'
```

`findBySlug` of the 100,000th item should return in microseconds, regardless of where in the list it is. Without the index, it scans 100,000 entries every time.

## Exercises

1. Add an index for `currency`. Same shape as `tagIndex` but keyed by enum. Then route the currency filter through it. Which filter is *more* selective at 100k products — currency or tag?
2. The `_addToIndexes` function only mutates state; it never throws. What invariant would it break if the slug index already had a key? (Hint: that's why `POST /products` checks `findBySlug` *before* calling `create`.)
3. Soft-deleting a product leaves its slug in the index but `findBySlug` skips it (via the visibility filter). Write a test that confirms: delete a product, try to create a new product with its slug → 409.

## Next

Lesson 13 — variants. The model that took Shopify a decade to get right.
