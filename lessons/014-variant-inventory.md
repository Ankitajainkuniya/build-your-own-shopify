# Lesson 14 — Inventory belongs to the variant, not the product

**Goal:** Move `inventory` off `Product` and onto `Variant`. Every product has at least one variant. The product's "inventory" in API responses becomes a *computed* sum.

**Files:**

- `src/products/types.ts` (modified — removed `inventory` from `Product`)
- `src/products/seed.ts` (modified — seed creates Default variants for each product)
- `src/products/inventory.ts` (new — `productInventory()`, `serializeProduct()`)
- `src/products/routes.ts` (modified — POST auto-creates Default variant; responses use `serializeProduct`)
- `src/server.ts` (modified — seedProducts now handles variants too)

## The migration

Yesterday: `Product { inventory: 24 }`. Today: `Product {}` + `Variant { productId, inventory: 24 }`. The product's `inventory` in API responses is computed as `sum(variants.inventory)`.

This is the migration Shopify did in their first three years and that they've talked about repeatedly. Every commerce platform converges on the same shape:

| Layer | What lives there |
|---|---|
| **Product** | Marketing: title, description, images, slug, SEO, tags. Pure metadata. |
| **Variant** | Operations: SKU, price, inventory, weight, dimensions, barcode. |
| **Inventory item** | (Future) Stock at a specific location. One variant × N locations = N inventory items. |

The reason: every operational fact is *variant-level* in the real world. Inventory of "Red Small" is independent of "Blue Large". They have different SKUs, different stock counts, possibly different prices. Putting any of this on the product forces you to pick one variant as "canonical" — and you'll get it wrong.

## How we kept backwards compat in the response

The API response still includes `inventory: 24` on a product. That's a *derived* value, computed every time:

```ts
export function productInventory(productId: string): number {
  return variants
    .listForProduct(productId)
    .reduce((sum, v) => sum + v.inventory, 0);
}

export function serializeProduct(p: Product) {
  return { ...p, inventory: productInventory(p.id) };
}
```

Every route that returns a product now goes through `serializeProduct`. Clients see no change. Internally, there's no `inventory` field on `Product` at all.

Trade-offs:

- **No more inventory drift.** Before, `Product.inventory` could disagree with `Σ Variant.inventory` after a bug. Now they can't — the sum *is* the truth.
- **Compute on every read.** With 3 variants, no big deal. With 200 variants and high read traffic, this is what caches and denormalization are for (lesson 30).
- **A real database would materialize this.** A computed column, a triggered cache field, or a materialized view. We'll cover the cache pattern in Module 10.

## The "Default variant" pattern

If you `POST /products` with `inventory: 40`, what should happen? Two answers:

1. Reject the request — inventory belongs on variants now, post one.
2. Auto-create a "Default" variant with that inventory.

We picked option 2. It's friendlier to existing clients and matches Shopify's behavior. Single-option products (no color, no size) still have a "Default Title" variant carrying their inventory and price. From the API consumer's perspective, simple products feel simple.

```ts
const defaultVariant: Variant = {
  id: newVariantId(),
  productId: product.id,
  sku: null,
  title: "Default",
  priceCents: null,                       // inherits product's price
  inventory: input.inventory ?? 0,
  optionValues: {},                       // no options yet
  position: 0,
  /* ... */
};
variants.create(defaultVariant);
```

The "empty `optionValues: {}`" is the canonical "no options" representation. Lesson 15 introduces real options; until then, every variant has the same `{}` shape.

## What PATCH inventory does now

We removed `inventory` from `PatchBody`. Try patching a product's inventory and you'll get a 400:

```bash
curl -X PATCH localhost:3000/products/p_1 \
  -H 'content-type: application/json' \
  -d '{"inventory":99}'
# → 400 Unrecognized key(s): 'inventory'
```

The error message is exactly the kind of thing that tells the client where to redirect: **inventory belongs to a variant, PATCH the variant.**

```bash
curl -X PATCH localhost:3000/products/p_1/variants/v_xxx \
  -H 'content-type: application/json' \
  -d '{"inventory":99}'
```

## How `?in_stock=true` works now

```ts
.filter((p) => {
  if (in_stock === undefined) return true;
  const stock = productInventory(p.id);
  return in_stock ? stock > 0 : stock === 0;
})
```

For each candidate product, we sum its variant inventory and filter accordingly. A product is "in stock" if **any** variant has inventory; "out of stock" only when all variants are at zero.

What this doesn't tell you: which specific variant is in stock. That's a per-variant filter at the variant endpoint. For a customer-facing PDP (product detail page) you typically want both: show the product, but disable the "Add to Cart" button for variants that are out.

## What we deliberately skipped

- **Inventory reservations.** "When someone adds Red Small to their cart, decrement by 1 immediately or wait until checkout?" Massive topic; Module 3 (Inventory) covers it.
- **Inventory at multiple locations.** Lesson 32.
- **`out_of_stock_behavior`.** "Hide", "Show as sold-out", "Backorder". Per-product configuration. Module 7.
- **Negative inventory.** Sometimes legitimately needed for pre-orders. Right now we 400 on negative. Module 3.

## Try it

```bash
# Seeded p_1 has inventory 24 (in its Default variant)
curl -s localhost:3000/products/p_1 | jq '.inventory'
# → 24

# Add another variant with inventory 5
curl -s -X POST localhost:3000/products/p_1/variants \
  -H 'content-type: application/json' \
  -d '{"optionValues":{"size":"xxl"},"inventory":5}'

# Product inventory is now the sum
curl -s localhost:3000/products/p_1 | jq '.inventory'
# → 29

# Patch the new variant
curl -s -X PATCH localhost:3000/products/p_1/variants/<vid> \
  -H 'content-type: application/json' \
  -d '{"inventory":100}'

# Product inventory updates automatically
curl -s localhost:3000/products/p_1 | jq '.inventory'
# → 124
```

## Exercises

1. The `productInventory` function is O(variants per product). For 200 variants and 50 RPS reads, that's 10k variant lookups/sec. Add a Map<productId, totalInventory> cache inside the variants store. Where do you invalidate it?
2. Soft-deleted variants currently count toward inventory. Should they? (Hint: `variants.listForProduct(p.id)` defaults to `includeDeleted: false`, so they don't. But you can pass `{ includeDeleted: true }` — when would you?)
3. A product with zero variants has `inventory: 0`. Should this even be a valid state? Add a guard: every product must have ≥1 variant. Where do you enforce it?

## Next

Lesson 15 — options. Color: [Red, Blue], Size: [S, M, L] → six variants generated automatically. End of Module 1.
