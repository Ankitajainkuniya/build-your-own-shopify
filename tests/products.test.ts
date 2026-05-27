import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/server";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("returns ok:true", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe("GET /products", () => {
  it("returns seeded items", async () => {
    const res = await app.inject({ method: "GET", url: "/products" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ id: string }> };
    expect(body.items.length).toBeGreaterThanOrEqual(3);
    expect(body.items.some((p) => p.id === "p_1")).toBe(true);
  });

  it("honors ?limit", async () => {
    const res = await app.inject({ method: "GET", url: "/products?limit=2" });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBe(2);
  });

  it("rejects bad limit", async () => {
    const res = await app.inject({ method: "GET", url: "/products?limit=999" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("bad_request");
  });

  it("filters by ?search", async () => {
    const res = await app.inject({ method: "GET", url: "/products?search=mug" });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items.every((p: { title: string }) => p.title.toLowerCase().includes("mug"))).toBe(true);
  });

  it("includes requestId in error responses", async () => {
    const res = await app.inject({ method: "GET", url: "/products?limit=banana" });
    expect(res.statusCode).toBe(400);
    expect(res.json().requestId).toMatch(/^req_/);
  });
});

describe("GET /products/:id", () => {
  it("returns a single product", async () => {
    const res = await app.inject({ method: "GET", url: "/products/p_2" });
    expect(res.statusCode).toBe(200);
    expect(res.json().slug).toBe("ceramic-mug");
  });

  it("404s an unknown id", async () => {
    const res = await app.inject({ method: "GET", url: "/products/p_does_not_exist" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("not_found");
  });
});

describe("POST /products", () => {
  it("creates a product, assigns id and createdAt, returns 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/products",
      payload: { title: "Wool Beanie", priceCents: 3200, currency: "USD", inventory: 40 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toMatch(/^p_/);
    expect(body.title).toBe("Wool Beanie");
    expect(body.inventory).toBe(40);
    expect(body.createdAt).toBeTruthy();
    expect(res.headers.location).toBe(`/products/${body.id}`);
  });

  it("rejects negative prices", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/products",
      payload: { title: "Bad", priceCents: -1, currency: "USD" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects unknown currencies", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/products",
      payload: { title: "X", priceCents: 100, currency: "BTC" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("ignores client-supplied id (server controls identity)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/products",
      payload: { id: "p_HACKER", title: "X", priceCents: 100, currency: "USD" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).not.toBe("p_HACKER");
  });
});

describe("slugs (lesson 7)", () => {
  it("derives slug from title", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/products",
      payload: { title: "Crème Brûlée Spoon", priceCents: 1200, currency: "USD" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().slug).toBe("creme-brulee-spoon");
  });

  it("409s on duplicate slug", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/products",
      payload: { title: "Unique Test Item AAA", priceCents: 100, currency: "USD" },
    });
    expect(first.statusCode).toBe(201);

    const dup = await app.inject({
      method: "POST",
      url: "/products",
      payload: { title: "Unique Test Item AAA", priceCents: 200, currency: "USD" },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("conflict");
  });

  it("400s when title yields empty slug", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/products",
      payload: { title: "---", priceCents: 100, currency: "USD" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /products/by-slug/:slug returns the product", async () => {
    const res = await app.inject({ method: "GET", url: "/products/by-slug/ceramic-mug" });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe("p_2");
  });

  it("GET /products/by-slug/:slug 404s on unknown slug", async () => {
    const res = await app.inject({ method: "GET", url: "/products/by-slug/no-such-thing" });
    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /products/:id (lesson 8)", () => {
  it("updates a single field, bumps updatedAt, preserves createdAt", async () => {
    const before = (await app.inject({ method: "GET", url: "/products/p_1" })).json();
    const res = await app.inject({
      method: "PATCH",
      url: "/products/p_1",
      payload: { priceCents: 9999 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.priceCents).toBe(9999);
    expect(body.title).toBe(before.title);
    expect(body.createdAt).toBe(before.createdAt);
    expect(new Date(body.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(before.updatedAt).getTime());
  });

  it("404s on unknown id", async () => {
    const res = await app.inject({ method: "PATCH", url: "/products/p_nope", payload: { priceCents: 1 } });
    expect(res.statusCode).toBe(404);
  });

  it("rejects unknown fields (strict)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/products/p_1",
      payload: { wat: 42 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("changing slug enforces uniqueness", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/products/p_1",
      payload: { slug: "ceramic-mug" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("changing slug to a free value works and normalizes", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/products/p_3",
      payload: { slug: "Brown Leather Wallet!" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().slug).toBe("brown-leather-wallet");
  });
});

describe("cursor pagination (lesson 9)", () => {
  it("returns nextCursor when there are more pages", async () => {
    const res = await app.inject({ method: "GET", url: "/products?limit=1" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBe(1);
    expect(body.nextCursor).toBeTruthy();
  });

  it("returns nextCursor=null when at end of list", async () => {
    const res = await app.inject({ method: "GET", url: "/products?limit=100" });
    expect(res.statusCode).toBe(200);
    expect(res.json().nextCursor).toBeNull();
  });

  it("walks forward with cursor, no duplicates, no skips", async () => {
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    while (pages < 10) {
      const url = cursor ? `/products?limit=1&cursor=${encodeURIComponent(cursor)}` : "/products?limit=1";
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      for (const item of body.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      if (!body.nextCursor) break;
      cursor = body.nextCursor;
      pages += 1;
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it("400s on unknown cursor", async () => {
    const res = await app.inject({ method: "GET", url: "/products?cursor=p_nope_nope" });
    expect(res.statusCode).toBe(400);
  });
});

describe("search + filtering (lesson 10)", () => {
  it("filters by currency", async () => {
    const res = await app.inject({ method: "GET", url: "/products?currency=USD" });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.every((p: any) => p.currency === "USD")).toBe(true);
  });

  it("filters by tag", async () => {
    const res = await app.inject({ method: "GET", url: "/products?tag=sale" });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThan(0);
    expect(res.json().items.every((p: any) => p.tags.includes("sale"))).toBe(true);
  });

  it("filters by in_stock", async () => {
    const inStock = (await app.inject({ method: "GET", url: "/products?in_stock=true" })).json();
    const outOfStock = (await app.inject({ method: "GET", url: "/products?in_stock=false" })).json();
    expect(inStock.items.every((p: any) => p.inventory > 0)).toBe(true);
    expect(outOfStock.items.every((p: any) => p.inventory === 0)).toBe(true);
  });

  it("filters by price range", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/products?min_price=2000&max_price=7000",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.every((p: any) => p.priceCents >= 2000 && p.priceCents <= 7000)).toBe(true);
  });

  it("?q= is an alias for ?search=", async () => {
    const a = (await app.inject({ method: "GET", url: "/products?q=mug" })).json();
    const b = (await app.inject({ method: "GET", url: "/products?search=mug" })).json();
    expect(a.items.map((p: any) => p.id).sort()).toEqual(b.items.map((p: any) => p.id).sort());
  });

  it("filters compose (AND)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/products?currency=USD&tag=kitchen",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.every((p: any) => p.currency === "USD" && p.tags.includes("kitchen"))).toBe(true);
  });

  it("accepts tags on create", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/products",
      payload: {
        title: "Tagged Product Z",
        priceCents: 1000,
        currency: "USD",
        tags: ["new", "featured"],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().tags).toEqual(["new", "featured"]);
  });
});

describe("soft delete (lesson 11)", () => {
  it("DELETE returns 204 and hides product from default list", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/products",
      payload: { title: "Doomed Item One", priceCents: 100, currency: "USD" },
    });
    const id = create.json().id;

    const del = await app.inject({ method: "DELETE", url: `/products/${id}` });
    expect(del.statusCode).toBe(204);

    const after = await app.inject({ method: "GET", url: `/products/${id}` });
    expect(after.statusCode).toBe(404);

    const list = await app.inject({ method: "GET", url: "/products?limit=100" });
    expect(list.json().items.some((p: any) => p.id === id)).toBe(false);
  });

  it("?include_deleted=true reveals deleted products", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/products",
      payload: { title: "Doomed Item Two", priceCents: 100, currency: "USD" },
    });
    const id = create.json().id;
    await app.inject({ method: "DELETE", url: `/products/${id}` });

    const list = await app.inject({ method: "GET", url: "/products?limit=100&include_deleted=true" });
    const found = list.json().items.find((p: any) => p.id === id);
    expect(found).toBeTruthy();
    expect(found.deletedAt).toBeTruthy();
  });

  it("POST /restore brings it back", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/products",
      payload: { title: "Doomed Item Three", priceCents: 100, currency: "USD" },
    });
    const id = create.json().id;
    await app.inject({ method: "DELETE", url: `/products/${id}` });

    const restore = await app.inject({ method: "POST", url: `/products/${id}/restore` });
    expect(restore.statusCode).toBe(200);
    expect(restore.json().deletedAt).toBeNull();

    const after = await app.inject({ method: "GET", url: `/products/${id}` });
    expect(after.statusCode).toBe(200);
  });

  it("DELETE on already-deleted product returns 404", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/products",
      payload: { title: "Doomed Item Four", priceCents: 100, currency: "USD" },
    });
    const id = create.json().id;
    await app.inject({ method: "DELETE", url: `/products/${id}` });
    const again = await app.inject({ method: "DELETE", url: `/products/${id}` });
    expect(again.statusCode).toBe(404);
  });

  it("restoring a non-deleted product returns 400", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/products",
      payload: { title: "Live Item Five", priceCents: 100, currency: "USD" },
    });
    const id = create.json().id;
    const res = await app.inject({ method: "POST", url: `/products/${id}/restore` });
    expect(res.statusCode).toBe(400);
  });
});

describe("indexes (lesson 12)", () => {
  it("slug index keeps a deleted product's slug occupied (cannot create duplicate)", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/products",
      payload: { title: "Slug Squatter Alpha", priceCents: 100, currency: "USD" },
    });
    const id = create.json().id;
    const slug = create.json().slug;

    await app.inject({ method: "DELETE", url: `/products/${id}` });

    const dup = await app.inject({
      method: "POST",
      url: "/products",
      payload: { title: "Slug Squatter Alpha", priceCents: 200, currency: "USD", slug },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("tag changes keep the tag index in sync", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/products",
      payload: {
        title: "Tag Migrant Beta",
        priceCents: 100,
        currency: "USD",
        tags: ["migration-test"],
      },
    });
    const id = create.json().id;

    const inTag = await app.inject({ method: "GET", url: "/products?tag=migration-test&limit=100" });
    expect(inTag.json().items.some((p: any) => p.id === id)).toBe(true);

    await app.inject({
      method: "PATCH",
      url: `/products/${id}`,
      payload: { tags: ["other-test"] },
    });

    const stillInOld = await app.inject({ method: "GET", url: "/products?tag=migration-test&limit=100" });
    expect(stillInOld.json().items.some((p: any) => p.id === id)).toBe(false);

    const inNew = await app.inject({ method: "GET", url: "/products?tag=other-test&limit=100" });
    expect(inNew.json().items.some((p: any) => p.id === id)).toBe(true);
  });
});
