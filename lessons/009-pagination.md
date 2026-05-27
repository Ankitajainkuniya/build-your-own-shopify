# Lesson 9 — Pagination, the right way

**Goal:** Replace "return everything" with cursor-based pagination. `?limit=20&cursor=<last_seen_id>` → `{ items: [...], nextCursor: "..." }`. Walk pages with a single forward link.

**Files:**

- `src/products/routes.ts` (modified — `cursor` query param + `nextCursor` in response)

## Why we're not using offset

Offset pagination is the default everyone reaches for first:

```
GET /products?limit=20&offset=0       ← page 1
GET /products?limit=20&offset=20      ← page 2
GET /products?limit=20&offset=10000   ← page 501
```

It's easy to implement. It's also broken in three ways that you'll discover only at scale:

1. **It scans rows you don't return.** `OFFSET 10000` in SQL means the database walks 10,000 rows and throws them away. With every page, the cost goes up. Page 501 is 500× slower than page 1.
2. **It's unstable under inserts.** If a new product is created between requesting page 1 and page 2, every item shifts by one — you get duplicates and skips.
3. **It leaks the total count.** "Page 17 of 23" tells competitors how many products you have. Some companies want that, most don't.

## What cursor pagination actually is

Each response contains a `nextCursor` — an opaque token that says "here's where I am, give me what comes next."

```
GET /products?limit=20
→ { items: [...], nextCursor: "p_abc123" }

GET /products?limit=20&cursor=p_abc123
→ { items: [...], nextCursor: "p_xyz789" }

GET /products?limit=20&cursor=p_xyz789
→ { items: [...], nextCursor: null }    ← end of stream
```

The cursor's structure is the server's business. Today it's the last item's id; tomorrow it could be `base64({id, createdAt})` for stability under sort changes; clients shouldn't care.

Three properties this gives you for free:

1. **O(1) per page**, not O(n). Each page starts where the last one ended.
2. **No duplicates under insert** — new items get IDs that sort after existing ones (with monotonic IDs).
3. **No total leak** unless you separately add a `total` field (and you usually shouldn't).

## What our implementation does

```ts
const filtered = products.list()
  .filter(searchPredicate)
  .sort((a, b) => a.id < b.id ? -1 : 1);   // stable sort by id

let startIdx = 0;
if (cursor) {
  const cursorIdx = filtered.findIndex(p => p.id === cursor);
  if (cursorIdx === -1) throw BadRequest("cursor not found — page may have shifted, restart from the beginning");
  startIdx = cursorIdx + 1;
}

const page = filtered.slice(startIdx, startIdx + limit);
const nextCursor = (page.length === limit && startIdx + limit < filtered.length)
  ? page[page.length - 1].id
  : null;
```

Three things worth noting:

1. **We throw `400 Bad Request` if the cursor isn't found.** This happens if the underlying data shifted dramatically (rare for products, common in feeds). The client should restart from the beginning.
2. **`nextCursor: null` means end of stream.** Clients loop until they see null. Don't use an empty string or omit the field — `null` is the explicit signal.
3. **The sort key matters.** Right now we sort by id, which works because our seed ids are lexicographically increasing (`p_1`, `p_2`, `p_3`). In a real system you'd sort by `(createdAt DESC, id ASC)` and the cursor would encode both.

## What we deliberately skipped

- **Backwards pagination.** `prevCursor` so clients can navigate up. Rarely needed; if you need it, add it.
- **Total count.** Cheap on a small dataset, expensive at scale. Add only when product asks for it.
- **Cursor encoding (base64 of structured data).** Safer for production. Don't bother until your sort key is non-trivial.
- **Keyset pagination at the SQL layer.** When we migrate to SQLite in lesson 21, the cursor becomes a `WHERE (created_at, id) > (?, ?) ORDER BY created_at, id LIMIT ?` query.

## Try it

```bash
# First page
curl -s 'localhost:3000/products?limit=2' | jq

# Walk forward
curl -s 'localhost:3000/products?limit=2&cursor=p_1' | jq

# Invalid cursor
curl -s 'localhost:3000/products?cursor=p_does_not_exist' | jq
# → 400 Bad Request
```

## Exercises

1. Add a `?direction=desc` flag that reverses the sort. Does the cursor still work? Why or why not?
2. The cursor is the last item's id. What happens if a client URL-decodes it incorrectly? Try base64-encoding the cursor on the way out and base64-decoding on the way in — what protection does that add?
3. Walk the entire catalog by repeatedly hitting `?cursor=<last>` until `nextCursor` is null. Time how long this takes for 1,000 products (simulate by POSTing 1,000 times). Compare to a hypothetical offset-based version.

## Next

Lesson 10 — filtering, search, and the difference between substring matching and real full-text search.
