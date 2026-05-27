# Lesson 3 — Listing products

**Goal:** Expose the product store via `GET /products` and return JSON. Seed the store with a few example items so the endpoint isn't empty.

**Files:**

- `src/products/seed.ts` (new)
- `src/products/routes.ts` (new)
- `src/server.ts` (modified — register the new routes)

## What we did

```ts
// routes.ts
import type { FastifyInstance } from "fastify";
import { products } from "./store";

export async function registerProductRoutes(app: FastifyInstance) {
  app.get("/products", async () => {
    return { items: products.list() };
  });
}
```

And in `server.ts`:

```ts
import { registerProductRoutes } from "./products/routes";
import { seedProducts } from "./products/seed";

seedProducts();
await registerProductRoutes(app);
```

## Three things to notice

1. **The response is wrapped in `{ items: [...] }`.** Don't return a bare array at the top level. The day you want to add `total`, `nextCursor`, or `appliedFilters` to the response, you'll be glad you did this from the start. Versioning a "bare array" API is painful.

2. **`registerProductRoutes` takes the app instance as a parameter.** This is the Fastify "plugin" pattern in disguise. Even though we're not using `fastify.register()` formally yet, this shape makes it trivial to convert later.

3. **`seedProducts()` is called at boot, not lazily.** Why? Because we want test failures at boot time, not the first time someone hits `/products`. The faster you fail, the cheaper the bug is to fix.

## What we deliberately skipped

- **Pagination.** Right now we return everything. With 10k products this would be a problem. Lesson 9 introduces cursor-based pagination.
- **Filtering / search.** `GET /products?tag=sale` — lesson 9.
- **Caching headers.** `Cache-Control`, `ETag`. Lesson 19.
- **Field selection.** `GET /products?fields=id,title`. This is a luxury most APIs don't need. We won't add it at all.

## Exercises

1. The endpoint always returns all products. Add a `?limit=10` query parameter that caps the result. What happens if `limit` is `0`? Negative? `"banana"`? (Foreshadowing lesson 5 on validation.)
2. Visit `/products` in your browser. The JSON is unindented. Find the Fastify option that pretty-prints in development but not in production.
3. What's the difference between `app.get("/products", ...)` and using `fastify.register(plugin, { prefix: "/products" })`? Read the Fastify docs and form an opinion on when each is right.

## Next

Lesson 4 — make errors look like errors, not 500-with-no-context.
