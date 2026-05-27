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
