# Lesson 5 — Validating requests with Zod

**Goal:** Reject malformed requests at the boundary with a clear error, before any business logic sees them.

**Files:**

- `src/products/routes.ts` (modified — add Zod schema for query params)
- `tests/products.test.ts` (new — verify validation works)

## The principle

> Validate at the boundary, trust inside.

Every value crossing into your system from the outside world — HTTP query strings, request bodies, webhook payloads, CSV rows — is **unverified bytes** until you've checked them. Validation is the gate. Past the gate, your code can trust the shape.

Without this rule, every internal function ends up doing defensive `typeof` checks "just in case". With this rule, internal types are honest.

## What we did

```ts
import { z } from "zod";

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(100).optional(),
});

app.get("/products", async (req) => {
  const parse = ListQuery.safeParse(req.query);
  if (!parse.success) {
    throw BadRequest("invalid query parameters", parse.error.flatten());
  }
  const { limit, search } = parse.data;
  const items = products.list()
    .filter((p) => !search || p.title.toLowerCase().includes(search.toLowerCase()))
    .slice(0, limit);
  return { items };
});
```

## Three details worth noticing

1. **`z.coerce.number()` for query strings.** Query parameters arrive as strings. Without `coerce`, `?limit=10` fails validation because `"10"` is a string. With `coerce`, Zod tries to convert.

2. **`safeParse` over `parse`.** `parse` throws an exception; `safeParse` returns `{ success, data | error }`. The second is cleaner because we control how the failure surfaces — in our case, by throwing `BadRequest` (from lesson 4).

3. **`parse.error.flatten()` in `details`.** This produces a structured `{ formErrors, fieldErrors }` object that's much friendlier for clients than the default verbose Zod error tree.

## What we deliberately skipped

- **Body schemas.** No `POST` yet. Lesson 6 introduces product creation and you'll write your first body schema.
- **Fastify's schema integration.** Fastify supports JSON Schema for validation built-in (using AJV). We could pass `{ schema: { querystring: ... } }` to `app.get()`. Why aren't we? Because Zod schemas are reusable in non-Fastify contexts (CLI tools, workers, tests), and the indirection is worth it. Some teams do prefer raw JSON Schema. Both are defensible.
- **Async validation.** "Is this slug unique?" requires a DB lookup; that's not validation, that's a business rule. Different layer.

## Exercises

1. Add a `?currency=USD|EUR|INR` filter. Use a Zod enum.
2. The `BadRequest` error now carries `details`. Verify (with curl + jq) that the JSON envelope includes them.
3. Send `?limit=999` (way over the max). Read the error response. Now imagine you're writing a Stripe-style SDK around this API — what would you log on the SDK side to help your customer? (Hint: the `details.fieldErrors` block.)

## End of Foundations module

You now have:

- A logged, error-handling server
- A typed product model
- A list endpoint
- Boundary validation

Module 1 (Products) starts in lesson 6: product creation, variants, slugs, and the first real database schema.

Star and watch the repo to know when it ships.
