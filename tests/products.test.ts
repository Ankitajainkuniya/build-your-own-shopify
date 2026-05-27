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
