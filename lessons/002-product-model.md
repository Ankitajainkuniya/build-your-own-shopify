# Lesson 2 — Defining a Product

**Goal:** Model what a product is, in TypeScript, before we expose it to any HTTP route.

**Files:**

- `src/products/types.ts` (new)
- `src/products/store.ts` (new)

## What we did

We split the product concept into two things:

1. **The type** (`types.ts`) — the shape a product takes, irrespective of where it's stored.
2. **The store** (`store.ts`) — a tiny in-memory data layer with the operations we'll need: `list`, `get`, `create`. For the first few lessons it's just a `Map`; in lesson 20 we swap it for SQLite without changing any callers.

```ts
// types.ts
export interface Product {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  currency: "USD" | "EUR" | "INR";
  inventory: number;
  createdAt: Date;
}
```

```ts
// store.ts
const items = new Map<string, Product>();

export const products = {
  list: () => Array.from(items.values()),
  get: (id: string) => items.get(id),
  create: (p: Product) => { items.set(p.id, p); return p; },
};
```

## Why we chose these fields

| Field | Why this and not something else |
|---|---|
| `id` | Opaque UUID. Never an auto-increment int — those leak business volume to the public ("are they really at order #43?"). |
| `slug` | Human-readable URL identifier. Separate from `id` because the slug can change (rebrand, typo fix) while the id can't. |
| `priceCents` | Always integer minor units. Storing money as float will hurt you eventually (`0.1 + 0.2 !== 0.3`). |
| `currency` | Stored on the product. Yes, real platforms have prices per currency per region — but that's lesson 36. We start simple. |
| `inventory` | A single integer. We'll discover all the ways this is wrong (reservations, variants, etc.) over the next 30 lessons. |
| `createdAt` | Always store creation timestamps. You will need this when you want to know "what changed yesterday". |

## What we deliberately skipped

- **Variants and options.** A T-shirt has a size and color; that's a variant. Lesson 12.
- **Soft delete (`deletedAt`).** Lesson 8.
- **Multi-currency pricing.** Lesson 36.
- **Indexing.** A Map gives O(1) by id but O(n) for everything else. We'll feel this pain in lesson 21 when we measure.

## Exercises

1. Add a `description` field (optional string). Why is it optional and not required?
2. Add a `tags: string[]` field. Now think: how would you find all products with the tag `"sale"`? With a `Map`, what's the time complexity?
3. Should `priceCents` ever be negative? Add a runtime check. Should the type itself enforce non-negative? (TypeScript doesn't have refinement types, so the answer is "not really" — we'll use Zod for this in lesson 5.)

## Next

Lesson 3 — expose this store via an HTTP route. `GET /products`.
