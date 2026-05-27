# build-your-own-shopify

> **Build a tiny but real e-commerce backend from scratch, one commit at a time.**

This is a self-paced course where you build a working e-commerce platform — products, carts, checkout, inventory, webhooks, the works — from an empty folder to a functioning system. No magic, no framework hand-waving. Every commit is a tagged lesson with a written explanation of what you added and why.

Inspired by [`build-your-own-x`](https://github.com/codecrafters-io/build-your-own-x), [`build-your-own-redis`](https://app.codecrafters.io/courses/redis/overview), and the late, great Tushar Roy's interview prep approach: **understand by building**, not by reading.

## Why build your own Shopify?

You don't actually want to compete with Shopify. You want to understand:

- **How carts work without sessions.** Most tutorials punt to "Redis stores cart state" without explaining how guest carts merge with logged-in carts at checkout.
- **Why inventory is the hardest part.** Overselling under concurrency is a real bug. Reservation locks, optimistic vs pessimistic concurrency, and "rollback after Stripe declined" are non-trivial.
- **What an idempotency key really protects.** Webhooks, payments, retries — most "production" code handles this wrong.
- **How shipping rate calculation works.** It's not "lookup a table". Weight, dimensions, carrier APIs, zones, free-shipping thresholds, tax.
- **Why discounts are state machines.** Stacked codes, automatic discounts, BOGO, tiered, "$X off your next order" — discount engines are how Shopify makes Shopify.

By lesson 50 you'll have a backend that supports a real-world shopping flow. By lesson 100 you'll know more about commerce backends than 90% of senior engineers at e-commerce startups.

## Course structure

The course is organized into modules. Each lesson is a separate git commit with a tag. You can fast-forward to any lesson by checking out its tag.

```
$ git tag --list
lesson-001-empty-server
lesson-002-product-model
lesson-003-list-products
...
lesson-050-stripe-webhook-idempotency
```

Each lesson lives in [`lessons/`](lessons/) as a markdown file: the **goal**, the **constraint** ("can you do it without sessions?"), and the **explanation** of why we picked the approach we did.

## Tech stack

- **TypeScript** + **Node.js** (because that's what most e-commerce backends are built in today)
- **Fastify** for the HTTP layer (faster than Express, less magic than Nest)
- **SQLite** for the first 20 lessons (zero setup); we migrate to **Postgres** in lesson 21 to learn what changes
- **Drizzle ORM** for type-safe queries
- **Stripe test mode** for payments — no real money, no real Stripe key required for most lessons
- **Vitest** for tests

You don't need to know Shopify, Postgres, or Stripe to start. You need to know TypeScript at a "I've written a CRUD API" level.

## Modules

| Module | Lessons | What you'll build |
|---|---|---|
| **00. Foundations** | 1–5 | Server, types, errors, structured logging, request validation |
| **01. Products** | 6–15 | Catalog, variants, options, search, pagination, indexing |
| **02. Carts** | 16–25 | Guest carts, merge on login, expiry, line item validation |
| **03. Inventory** | 26–35 | Stock tracking, reservations, concurrency, oversell prevention |
| **04. Pricing & Discounts** | 36–45 | Discount engine, codes, stacking rules, automatic discounts |
| **05. Checkout** | 46–55 | Address validation, shipping rates, tax (TaxJar mock), totals |
| **06. Payments** | 56–65 | Stripe integration, webhooks, idempotency, 3DS, refunds |
| **07. Orders** | 66–75 | Order lifecycle, fulfillment states, notifications, returns |
| **08. Admin** | 76–85 | Admin auth, audit log, dashboard endpoints, exports |
| **09. Webhooks & Apps** | 86–95 | Outbound webhooks, HMAC signing, retry policy, an "app" SDK |
| **10. Scale** | 96–100 | Caching strategies, read replicas, queue workers, observability |

## Start now

```bash
git clone https://github.com/Ankitajainkuniya/build-your-own-shopify
cd build-your-own-shopify
git checkout lesson-001-empty-server
cat lessons/001-empty-server.md
npm install
npm run dev
```

Then either:

- **Read forward** — `git log --oneline` and walk through each lesson as a reader.
- **Re-build it** — `git checkout main`, delete `src/`, and rebuild from lesson 1 using only the lesson notes as a guide.

The second approach is the one that teaches you. It's also the harder one.

## Status

- **v0.1 — Foundations module shipping now (lessons 1–5).**
- Lessons 6–15 (Products) — in progress.
- Lessons 16+ — planned.

This repo will be filled in over time. The structure and the first module are committed; subsequent modules ship as they're written. Star and watch if you want to follow along.

## Contributing

Once we're past lesson 25, PRs are welcome for:

- Translations of lesson notes
- Alternative implementations in other languages (Python / Go / Rust)
- Better exercises at the end of each lesson

Until then, the curriculum is being designed end-to-end by one author to keep it coherent.

## License

MIT for code. [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) for the written lesson notes.

---

Built by [@Ankitajainkuniya](https://github.com/Ankitajainkuniya) — ex-founder of a $5M ARR commerce product (acquired). The hard parts of commerce backends are not what tutorials cover. This fixes that.