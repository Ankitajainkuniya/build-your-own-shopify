# Lesson 15 — Options and auto-generating variant combinations

**Goal:** Let a product declare options (`Color: [red, blue]`, `Size: [S, M, L]`) and then auto-generate the Cartesian product as variants in one call. End of Module 1.

**Files:**

- `src/products/types.ts` (modified — added `ProductOption` interface + `options: ProductOption[]` on `Product`)
- `src/products/seed.ts` (modified — backfilled `options: []`)
- `src/products/routes.ts` (modified — added `POST /options`, `DELETE /options/:name`, `POST /generate-variants`)

## Options vs variants

| Concept | Lives on | Example |
|---|---|---|
| **Option** | Product | `Color: [red, blue]` |
| **Variant** | Product (as a child) | `{ color: "red" }` with its own SKU, inventory, price |

Options are the *schema*; variants are the *instances*. The two structures must agree: every variant's `optionValues` keys should appear in the product's `options` list, and every value should appear in the corresponding option's `values` list. We don't enforce this in v0.1 (it's fragile when options are renamed); a real implementation would.

## Cartesian product, the friendly way

Given:

```ts
options: [
  { name: "color", values: ["red", "blue"] },
  { name: "size", values: ["S", "M", "L"] },
]
```

We generate six combinations:

```ts
[
  { color: "red",  size: "S" },
  { color: "red",  size: "M" },
  { color: "red",  size: "L" },
  { color: "blue", size: "S" },
  { color: "blue", size: "M" },
  { color: "blue", size: "L" },
]
```

The implementation is a `reduce` + `flatMap`:

```ts
const combinations = options.reduce<Record<string, string>[]>(
  (acc, option) =>
    acc.flatMap(partial =>
      option.values.map(value => ({ ...partial, [option.name]: value }))
    ),
  [{}],   // start with one empty combination
);
```

Initial accumulator is `[{}]` (one empty object). Each step replaces every partial with one copy per value of the next option. The order of `options` matters and we sort by `position` so it's stable.

## The dedup trap

A naive implementation would clobber existing variants on re-generation. We don't — instead, we **fingerprint each combination** and skip the ones that already exist:

```ts
const fingerprint = JSON.stringify(combo, Object.keys(combo).sort());
```

Three things to notice:

1. **`JSON.stringify`'s second argument** is a replacer. If it's an array of strings, only those keys are included, *in that order*. We pass the sorted keys → keys come out sorted → fingerprint is order-stable.
2. **Without sorting**, `{color:"red",size:"S"}` and `{size:"S",color:"red"}` would have different fingerprints. With sorting, they don't. (This is the bug Exercise 1 of lesson 13 was pointing at.)
3. **The endpoint is idempotent.** Call it twice in a row, the second time creates zero variants. That's the right shape — clients can retry without consequence.

## The combinatorial explosion

5 options × 5 values each = 3,125 variants. 6 options × 6 values = 46,656. Real products never reach those numbers (Shopify caps at 100 variants for a reason), but a permissive API will be abused into generating 10,000 variants. We cap:

```ts
if (combinations.length > 100) {
  throw BadRequest("refusing to generate more than 100 variants in a single call", ...);
}
```

That's Shopify's number too. It's not arbitrary — it's the point past which the product page UX falls apart anyway. Past 100, you don't want variants; you want *bundles* (sell parts separately, build at checkout). That's a different module.

## Sparse vs dense

If a merchant only stocks "Red Small" and "Blue Large" but not the other four combinations, the data model should support that. It does:

- Generate the four wanted combinations manually via `POST /variants` (sparse).
- OR generate all six, then `DELETE` the four unwanted variants (dense, lazy).

We support both. The friction with the second path: if you re-run `generate-variants` after deleting, the deleted ones come back. That's a real Shopify problem; the fix is usually to track "explicitly deleted" combos so the generator skips them.

## What we deliberately skipped

- **Option-value renames.** Rename `red` to `crimson` and all variants with `color: "red"` go orphan. Real fix: variants reference option-value *ids*, not strings. We're going to need this in lesson 22 with the database.
- **Reordering options.** Changing the position of `color` from 0 to 1 shouldn't break anything, and currently it doesn't. But UIs that render options use `position`. Make sure your tests cover it.
- **Required vs optional options.** `Size` always required, `Engraving` optional. We don't model this. Module 2 (Carts) cares.
- **Per-option-value images.** "Red shirt picture only shows when you select Red." Image-option association. Module 6.

## End of Module 1

You now have:

| Endpoint group | Functionality |
|---|---|
| Products | create, read by id/slug, list with filters + cursor pagination + search, PATCH, soft delete, restore |
| Variants | create, list (per product), get, PATCH, soft delete |
| Options | add, remove |
| Variant generation | Cartesian product with idempotent retry, capped at 100 |

That's a real commerce catalog API. It's missing big things (images, locations, multi-currency, real DB, tax) — those are Module 6, 3, 7, and 21+ respectively. But the *shape* is right.

## Try it

```bash
# Create a t-shirt with no options yet
PROD=$(curl -s -X POST localhost:3000/products -H 'content-type: application/json' \
  -d '{"title":"Cotton Tee","priceCents":2500,"currency":"USD"}' | jq -r .id)

# Add options
curl -X POST "localhost:3000/products/$PROD/options" -H 'content-type: application/json' \
  -d '{"name":"color","values":["red","blue","green"]}'

curl -X POST "localhost:3000/products/$PROD/options" -H 'content-type: application/json' \
  -d '{"name":"size","values":["S","M","L"]}'

# Generate the 9 variant combinations
curl -X POST "localhost:3000/products/$PROD/generate-variants" | jq '.created | length'
# → 9

# Idempotent: call again
curl -X POST "localhost:3000/products/$PROD/generate-variants" | jq '{created: .created|length, skipped: .skipped|length}'
# → {"created":0,"skipped":9}

# Remove an option, re-generate
curl -X DELETE "localhost:3000/products/$PROD/options/size"
curl -X POST "localhost:3000/products/$PROD/generate-variants" | jq '.total'
# → 3 (just the colors, but the old size-variants are still there as orphans)
```

That last one — *orphan variants from a removed option* — is one of the cleanest bugs in commerce backends. Catching it gracefully is Module 2 work.

## Exercises

1. Add a `?clean=true` query param to `generate-variants` that soft-deletes any variant whose `optionValues` don't match the *current* options. Now option removal cleans up correctly. What invariant could this break?
2. The cap is 100. Make it configurable per product (`maxVariants`) with a default of 100 and a hard ceiling of 1000. Why a hard ceiling?
3. Two merchants in different tenants both generate variants for their products at the same time. Trace through the code: is there a race? Should there be a lock per product?

## Next

Module 2 — Carts. Why guest carts are harder than tutorials make them look.
