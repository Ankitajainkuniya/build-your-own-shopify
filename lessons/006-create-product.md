# Lesson 6 — Creating a product

**Goal:** Accept a `POST /products` request with a JSON body, validate it, persist the new product, and return it with a `201 Created` status and a `Location` header.

**Files:**

- `src/products/types.ts` (modified — added `CreateProductInput`)
- `src/products/routes.ts` (modified — added `POST /products` + body schema)

## The Input vs Storage type pattern

This is the single most useful pattern in API design:

```ts
// What the wire sends us — incomplete, untrusted
export interface CreateProductInput {
  title: string;
  priceCents: number;
  currency: Currency;
  inventory?: number;
  slug?: string;
}

// What we actually store — complete, server-controlled
export interface Product {
  id: string;          // we generate
  slug: string;        // we may derive (lesson 7)
  title: string;
  priceCents: number;
  currency: Currency;
  inventory: number;   // defaults to 0 if not provided
  createdAt: Date;     // we set
}
```

The client cannot send `id` or `createdAt`. If they do, we ignore them. The server controls the parts of the record that determine identity, ordering, and trust.

Most API bugs in the wild come from accepting the storage type as input ("PATCH /users with a JSON body that has `isAdmin: true`"). Splitting Input from Storage is structural protection against that whole class of bug.

## ID generation

```ts
import { randomBytes } from "node:crypto";
const newProductId = () => `p_${randomBytes(6).toString("base64url")}`;
```

Three rules for IDs:

1. **Opaque.** Don't leak business state. An autoincrement `id=437` tells me you've sold 437 products. A UUID tells me nothing.
2. **Prefixed.** `p_xxxxxx` for products, `o_xxxxxx` for orders. When debugging, you can tell what an ID refers to without context. Stripe pioneered this; copy it.
3. **Short enough to read aloud.** 48 bits of entropy (8 base64 chars) is plenty for a single tenant's product catalog. No need for full UUIDs unless you're worried about distributed birthday collisions.

## Status codes that matter

- `201 Created` — not `200 OK`. The standard. Tells the client "I made something new, here it is".
- `Location: /products/p_abc123` — the URL of the new resource. Some HTTP clients and frameworks follow this automatically.
- `400 Bad Request` — invalid body. Validation errors from lesson 5 already cover this.
- `409 Conflict` — duplicate slug. We'll surface this properly in lesson 7.

## What we deliberately skipped

- **Slug generation from title.** Right now we accept a slug or fall back to `product-${Date.now()}`. That's a placeholder. Lesson 7 makes it real.
- **Image upload.** This deserves its own lesson (probably in Module 6). Files vs JSON bodies, S3 presigned URLs, validation.
- **Audit log.** "User X created product Y at time T." Lesson 27 in the Admin module.
- **Idempotency.** If the client retries `POST /products`, do we create two? Lesson 56 (Payments) introduces idempotency keys; product creation gets them too.

## Try it

```bash
curl -X POST localhost:3000/products \
  -H 'content-type: application/json' \
  -d '{"title":"Wool Beanie","priceCents":3200,"currency":"USD","inventory":40}'
```

You should see a `201` response with the new product, including a server-generated `id` and `createdAt`.

## Exercises

1. Try posting an `id` field in the body. Why doesn't it become the product's id? (Hint: look at the Zod schema.)
2. Post a product with `priceCents: -100`. The error response should be a 400. What's in `details`?
3. The `slug` falls back to `product-${Date.now()}`. Two requests in the same millisecond would collide. Reproduce this with a quick `for` loop in node, then write a one-line fix. (Lesson 7 will do it properly, but think first.)

## Next

Lesson 7 — slugs, properly. Slugify, enforce uniqueness, handle collisions.
