# Lesson 10 — Search and filtering

**Goal:** Add real filters (`?currency=USD`, `?tag=sale`, `?in_stock=true`, `?min_price=`, `?max_price=`) and a search query (`?q=mug`). Make them compose. Be honest about the line between substring search and real full-text search.

**Files:**

- `src/products/types.ts` (modified — added `tags: string[]`)
- `src/products/seed.ts` (modified — backfilled tags)
- `src/products/routes.ts` (modified — expanded `ListQuery`, layered filters, accept `tags` on create/patch)

## End of Module 1

This is the last lesson in the Products module. At this point you have a real product API:

| Endpoint | What it does |
|---|---|
| `GET /products` | list + filter + paginate |
| `GET /products/:id` | fetch by opaque id |
| `GET /products/by-slug/:slug` | fetch by URL-safe slug |
| `POST /products` | create with body validation, slugify, 409 on dup |
| `PATCH /products/:id` | partial update with strict schema, slug uniqueness, updatedAt |

That's a real catalog endpoint. Module 2 (Carts) starts here.

## Filter design

Our filters are AND-combined (all must match). The query layer looks like a sieve:

```ts
const filtered = products.list()
  .filter(matchesSearch)
  .filter(matchesCurrency)
  .filter(matchesTag)
  .filter(matchesInStock)
  .filter(matchesPriceRange);
```

This is fine for in-memory and a few-thousand records. With a real database (lesson 21), each filter becomes a `WHERE` clause that the query planner can use indexes for.

Three design choices that matter at scale:

1. **AND, not OR.** `?tag=sale&tag=clearance` is ambiguous: do you want both or either? We support a single `tag` for now. Real APIs use `?tags=sale,clearance&op=any|all`. Stripe's API and Shopify's API both do this; pick a flavor.
2. **`q` is the canonical search param**, with `search` as a backward-compat alias. Once you ship one, you can't remove it; you can only deprecate.
3. **`in_stock=true` is a boolean filter**, not a count threshold. The day someone wants "more than 5 in stock" they'll need a `min_inventory` param. That's lesson 30 territory.

## Substring matching is not real search

```ts
p.title.toLowerCase().includes(needle.toLowerCase())
```

This is fine for "find me the mug". It is *not* fine for:

- **Typos.** `?q=ceramick` finds nothing.
- **Stemming.** `?q=walking` doesn't match "walks" or "walked".
- **Cross-field.** `?q="leather italy"` doesn't search the description, only the title.
- **Relevance ranking.** Every match weighted equally; no notion of "best".

Real product search is its own engineering problem. Three honest answers:

- **Postgres `tsvector` + `pg_trgm`** — gets you 80% of the way there, ships with your database, costs nothing. Lesson 23.
- **Typesense / Meilisearch** — open-source dedicated search engines, ship a docker container, get fuzzy matching and ranking. Module 6 covers this.
- **Algolia / Elastic Cloud** — managed services with great DX and a real bill. We won't cover but they're a fine choice.

`?q=mug` is a 99th-percentile-of-tutorials feature that's actually the 5th-percentile of real search. Be honest about that with your future self.

## Tags as the start of categorization

We added `tags: string[]` to Product:

```ts
{ id: "p_2", slug: "ceramic-mug", title: "Ceramic Mug", tags: ["home", "kitchen", "sale"], ... }
```

Tags are deliberately the simplest form of categorization. They're not the same as:

- **Collections** — curated, ordered, with their own slugs (`/collections/summer-sale`). Lesson 14.
- **Categories** — hierarchical tree (Apparel → Tops → T-Shirts). Lesson 15.
- **Facets** — filterable attributes (color: red, size: M). Lesson 13.

A tag is just a string a merchant attached. They have no schema. They're great for ad-hoc filtering and search boosts; they're awful as the foundation of your taxonomy. Don't conflate them.

## What we deliberately skipped

- **Multi-tag filtering.** `?tags=sale,clearance&op=any|all`.
- **Faceted search response.** A real product list page also tells you "Filtering by Apparel gives you 47 results: 12 Tops, 18 Bottoms, 17 Shoes". That's a faceted response. Big feature; postponed.
- **Sorting.** `?sort=price_asc|price_desc|newest|popular`. Pagination becomes more interesting when sort can change.
- **Geo / availability filters.** "Only show me products that ship to ZIP 94110 within 2 days." That's an inventory + logistics problem, not a product-list one.

## Try it

```bash
# All USD products
curl -s 'localhost:3000/products?currency=USD' | jq '.items[].slug'

# Only on-sale items
curl -s 'localhost:3000/products?tag=sale' | jq '.items[].slug'

# In stock + under $50
curl -s 'localhost:3000/products?in_stock=true&max_price=5000' | jq '.items[].slug'

# Search
curl -s 'localhost:3000/products?q=mug' | jq '.items[].title'
```

## Exercises

1. Filter combinations compose with AND. Add a `?match=any` flag that flips this to OR. Should it apply to all filters or only some?
2. Pagination + filtering: walk a filtered list with cursor pagination. What happens if a product matches the filter on page 2 but no longer matches on page 3 because of a concurrent update? (This is why pagination after filtering is harder than it looks.)
3. Implement a `?sort=price_asc` flag. Now combine with cursor pagination. What does the cursor need to encode? (Spoiler: the price and id of the last item, not just the id.)

## End of Foundations + Module 1

You now have a typed, validated, paginated, filterable product API with proper errors and request tracing. Module 2 (Carts) is next — guest carts, merge-on-login, expiry, and why this is harder than it looks.

Star and watch for module 2.
