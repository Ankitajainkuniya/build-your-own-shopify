# Lesson 11 — Soft delete and restore

**Goal:** A `DELETE /products/:id` that doesn't actually drop the row. Items are marked with `deletedAt: Date` and hidden from default queries. `POST /products/:id/restore` un-deletes.

**Files:**

- `src/products/types.ts` (modified — added `deletedAt: Date | null`)
- `src/products/seed.ts` (modified — backfilled `deletedAt: null`)
- `src/products/store.ts` (modified — `list/get/findBySlug` accept `{ includeDeleted }`; added `softDelete` and `restore`)
- `src/products/routes.ts` (modified — added `DELETE`, `POST /restore`, `?include_deleted=true`)

## Hard delete vs soft delete vs archive

Three patterns, three different reasons:

| Pattern | What happens | When to use |
|---|---|---|
| **Hard delete** | Row gone, references break, no recovery | Truly junk: spam comments, test data, GDPR right-to-erasure |
| **Soft delete** | Row stays, `deletedAt` set, queries filter it out | Almost everything else in a commerce backend |
| **Archive** | Row moved to a separate `*_archived` table | Closed orders, completed promotions — keep around for analytics but out of hot tables |

For products, **soft delete is the default**. Here's why:

1. **Foreign keys don't break.** An order placed last week refers to a product. Hard-deleting the product breaks the order. Soft-deleting keeps the link intact.
2. **Accidental deletes are recoverable.** Merchant misclicks "delete". One PATCH back to `deletedAt: null`. With hard delete, you're restoring from backups (and explaining the gap).
3. **Audit trails make sense.** "When was this product removed from the store?" → `deletedAt`.
4. **You'd build soft delete anyway** to support archival, scheduled un-publish, "ended" promotions, etc. Doing it once consistently is cleaner.

The cost: every query needs `WHERE deleted_at IS NULL` (or the in-memory equivalent). Easy to forget; treats your future self badly. Centralize it in the store.

## What we changed in the store

```ts
list(opts = {}) {
  const all = Array.from(items.values());
  return opts.includeDeleted ? all : all.filter(p => p.deletedAt === null);
}
get(id, opts = {}) {
  const p = items.get(id);
  if (!p) return undefined;
  if (!opts.includeDeleted && p.deletedAt !== null) return undefined;
  return p;
}
findBySlug(slug, opts = {}) { /* same pattern */ }
```

Three things to notice:

1. **The default is "exclude deleted".** The override is opt-in. This is the right way around — the most common path (customer browsing products) doesn't need to know about deleted items.
2. **`get()` of a soft-deleted product returns `undefined`** unless you ask. The route then 404s. From the customer's perspective, the product is gone.
3. **`softDelete` and `restore` both bump `updatedAt`.** That's debatable — some teams track them separately. We chose simplicity; the audit log (lesson 27) will pick up the slack.

## 204 No Content on DELETE

```ts
app.delete("/products/:id", async (req, reply) => {
  const existing = products.get(req.params.id);
  if (!existing) throw NotFound("product");
  products.softDelete(existing.id);
  reply.code(204);
  return null;
});
```

`204 No Content` is the canonical response to a successful DELETE. The body is empty. Some APIs return the deleted resource with status 200; that's defensible but more idiosyncratic. We follow the spec.

Note `products.get(req.params.id)` *without* `includeDeleted`. If the product is already deleted, this returns undefined → 404. Idempotency would say "DELETE on an already-deleted thing should still be 204 or 200, since the state matches" — fair point, but we leaning toward 404 because *visible* state doesn't include the product. Pick a side, document it.

## Restore is a POST, not a PATCH

```
POST /products/:id/restore
```

Why not `PATCH /products/:id { "deletedAt": null }`? Two reasons:

1. **Restore is a verb, not a field write.** It might trigger side effects: re-emit a webhook, re-index for search, re-add to collections.
2. **PATCH's strict schema doesn't include `deletedAt`** — `deletedAt` is server-controlled. We don't want a client patching it.

The pattern is general: when a status transition is meaningful (`/cancel`, `/refund`, `/restore`, `/publish`, `/archive`), make it a sub-resource POST. Stripe and Shopify both do this consistently.

## What we deliberately skipped

- **Hard-delete-after-30-days job.** Soft-deleted rows accumulate forever in the current code. A real system has a background job: hard-delete any row with `deleted_at < now - 30 days`. Lesson 28 (jobs module).
- **Bulk operations.** `DELETE /products?tag=clearance` to delete every clearance item. Mass-mutation is its own can of worms (idempotency, rate-limiting, partial failure). Module 8.
- **GDPR right-to-erasure.** "Forget about me" is hard delete, not soft delete. We'd need a separate code path for personal data tables. Doesn't apply to products, but it's worth knowing the difference.

## Try it

```bash
# delete
curl -X DELETE -i localhost:3000/products/p_1
# → 204 No Content

# default list hides it
curl -s localhost:3000/products | jq '.items[].id'

# include_deleted brings it back
curl -s 'localhost:3000/products?include_deleted=true' | jq '.items[].id'

# restore
curl -X POST localhost:3000/products/p_1/restore | jq .deletedAt
# → null

# already-deleted DELETE → 404 (visible state matches)
curl -X DELETE -i localhost:3000/products/p_1
curl -X DELETE -i localhost:3000/products/p_1
# → 404
```

## Exercises

1. The `findBySlug` query already filters deleted. But a deleted product's slug is still occupied. Two designs: (a) a deleted product's slug stays "owned" so you can restore cleanly, (b) deleted products free their slug. Which does Shopify do? Pick a side and justify it.
2. Add a `deletedBefore` query param to filter by when items were deleted. Where in the schema does it live?
3. Soft delete + cursor pagination from lesson 9: if a product is soft-deleted between page 1 and page 2, what happens? Trace through the code.

## Next

Lesson 12 — make `findBySlug` and tag filtering O(1) with in-memory indexes. Real-world perf at a small scale, and a preview of what your database is doing under the hood.
