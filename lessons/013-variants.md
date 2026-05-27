# Lesson 13 — Variants: the model commerce hinges on

**Goal:** Introduce the `Variant` type and the endpoints to create / list / update / delete variants under a product. Establish that variants are children of products and that every "real" product will eventually have at least one.

**Files:**

- `src/variants/types.ts` (new — `Variant` interface)
- `src/variants/store.ts` (new — in-memory variants store, indexed by `productId` and `sku`)
- `src/variants/routes.ts` (new — nested under `/products/:id/variants`)
- `src/server.ts` (modified — register variant routes)

## What variants are

A "T-shirt" isn't one thing for sale. It's a *family* of things: Red Small, Red Medium, Red Large, Blue Small, Blue Medium, Blue Large. Six variants of one product. Each one:

- Has its own **SKU** (the warehouse needs to pick it)
- Tracks its own **inventory** (Blue Small can run out while Red Large is in stock)
- Can have its own **price** (XXL costs more) — or inherit the parent product's
- Can have its own **image** (red shirt vs blue shirt)

Without variants, every color/size combination would have to be a separate product, with duplicated description, duplicated images, duplicated SEO. Catastrophe.

Shopify's data model treats every product as having **at least one** variant — even single-option products get an auto-generated "Default Title" variant. This is the right move. Once you have variants, you put inventory and pricing on the variant (lesson 14), and the product becomes pure marketing metadata: title, description, images, SEO.

We're not there yet. This lesson introduces the variant *model*; lesson 14 moves inventory onto it; lesson 15 introduces *options* (the axes that generate variants).

## The shape

```ts
export interface Variant {
  id: string;                                   // v_xxxxxx
  productId: string;                            // belongs to one product
  sku: string | null;                           // optional warehouse identifier
  title: string;                                // "Red / Small" or "Default"
  priceCents: number | null;                    // null → inherit product.priceCents
  inventory: number;                            // moved to variant in lesson 14
  optionValues: Record<string, string>;         // {color:"red", size:"small"}
  position: number;                             // display order
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

Three design choices worth calling out:

1. **`priceCents: number | null`.** Null means "inherit from product". Most variants of a t-shirt cost the same; only XXL costs more. Storing the price as null on the common case keeps the product the source of truth.
2. **`optionValues: Record<string, string>`.** Not strongly-typed because the *options* (color, size, material) are per-product. The product owns the option schema; the variant has values that fit it. We'll formalize this in lesson 15.
3. **`position: number`.** Variants have a display order. Without it, "first variant" is whatever the Map iteration order is, which is fragile.

## Why nested routes

```
POST    /products/:id/variants
GET     /products/:id/variants
GET     /products/:id/variants/:variantId
PATCH   /products/:id/variants/:variantId
DELETE  /products/:id/variants/:variantId
```

Two design points:

1. **Nested under product.** A variant outside its product context is mostly meaningless — you always need the product for pricing, marketing, etc. The URL structure reinforces this.
2. **The product id is checked on every request.** `404 product not found` if the parent doesn't exist; `404 variant not found` if the variant exists but belongs to a different product. Without that check, attacker passes any product id and the route loads a variant by id anyway — a tenant-isolation hole.

You'll see Stripe break this convention (`POST /subscription_items` rather than `POST /subscriptions/:id/items`) — they argue that flat URLs are easier to type. They're not wrong but the cost is doing the parent-belongs-to-me check by hand, every endpoint. Pick a side.

## Variant uniqueness

Two variants of the same product can't have the same `optionValues`. Red/Small can only mean one thing.

```ts
const collision = existing.find(
  v => JSON.stringify(v.optionValues) === JSON.stringify(optionValues)
);
if (collision) throw Conflict("variant with this option combination already exists", ...);
```

`JSON.stringify` is a cheap fingerprint that works because `Record<string, string>` is flat. It's not order-stable for arbitrary objects, but for our shape (created server-side) we control the key order. A real implementation would sort keys first.

The other uniqueness check: **SKUs are globally unique** (across all products), not just per-product. A warehouse picking by SKU can't have two products claim the same one. So `findBySku` is global.

## What we deliberately skipped

- **Variant-specific images.** Real variants have images (red shirt photo vs blue shirt photo). Lesson 17 (Images module).
- **Variant inventory locations.** "12 in NY warehouse, 4 in LA, 0 in EU." Multi-location inventory is a beast. Module 3.
- **Variant compare-at price.** "Was $50, now $40" — `compareAtPriceCents`. Pricing module.
- **Variant deletion cascading.** When a product is deleted, what happens to its variants? Currently nothing — they're orphaned. Real fix in lesson 28 (when we have transactions).

## Try it

```bash
# Create a couple of variants on the linen shirt
curl -X POST localhost:3000/products/p_1/variants -H 'content-type: application/json' \
  -d '{"sku":"LIN-S","optionValues":{"size":"small"},"inventory":10}'

curl -X POST localhost:3000/products/p_1/variants -H 'content-type: application/json' \
  -d '{"sku":"LIN-M","optionValues":{"size":"medium"},"inventory":15}'

# List them
curl -s localhost:3000/products/p_1/variants | jq

# Try to duplicate Small — 409 Conflict
curl -X POST localhost:3000/products/p_1/variants -H 'content-type: application/json' \
  -d '{"optionValues":{"size":"small"}}'
```

## Exercises

1. The `optionValues` collision check uses `JSON.stringify`. Construct two variants with the same option values but different key insertion order. Does our code catch the collision? Fix it.
2. Add an endpoint `GET /variants/:id` (flat, not nested). The product id is now inferred from the variant. What's the trade-off vs the nested form?
3. The variant's `priceCents` is null by default. Add a `effectivePriceCents` derived field to the response — the actual price after inheriting the product's price. Where should this derivation live: store, route, or a separate "resolver" module? Argue for one.

## Next

Lesson 14 — move inventory off the product and onto the variant. The product's `inventory` becomes a sum. The day you wish you'd done this from the start.
