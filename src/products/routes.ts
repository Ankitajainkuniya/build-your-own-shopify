import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { BadRequest, Conflict, NotFound } from "../errors";
import { slugify } from "./slug";
import { products } from "./store";
import type { Product } from "./types";

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().min(1).max(100).optional(),
  currency: z.enum(["USD", "EUR", "INR"]).optional(),
  tag: z.string().trim().min(1).max(50).optional(),
  in_stock: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  min_price: z.coerce.number().int().min(0).optional(),
  max_price: z.coerce.number().int().min(0).optional(),
  include_deleted: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});

const TagList = z.array(z.string().trim().min(1).max(50)).max(20);

const CreateBody = z.object({
  title: z.string().trim().min(1).max(200),
  priceCents: z.number().int().min(0),
  currency: z.enum(["USD", "EUR", "INR"]),
  inventory: z.number().int().min(0).optional(),
  slug: z.string().trim().min(1).max(100).optional(),
  tags: TagList.optional(),
});

const PatchBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  priceCents: z.number().int().min(0).optional(),
  currency: z.enum(["USD", "EUR", "INR"]).optional(),
  inventory: z.number().int().min(0).optional(),
  slug: z.string().trim().min(1).max(100).optional(),
  tags: TagList.optional(),
}).strict();

const newProductId = (): string => `p_${randomBytes(6).toString("base64url")}`;

export async function registerProductRoutes(app: FastifyInstance): Promise<void> {
  app.get("/products", async (req) => {
    const parse = ListQuery.safeParse(req.query);
    if (!parse.success) {
      throw BadRequest("invalid query parameters", parse.error.flatten());
    }
    const { limit, search, q, cursor, currency, tag, in_stock, min_price, max_price, include_deleted } = parse.data;
    const needle = (q ?? search)?.toLowerCase();

    const candidates = tag
      ? products.findByTag(tag, { includeDeleted: include_deleted })
      : products.list({ includeDeleted: include_deleted });

    const filtered = candidates
      .filter((p) => !needle || p.title.toLowerCase().includes(needle))
      .filter((p) => !currency || p.currency === currency)
      .filter((p) => in_stock === undefined || (in_stock ? p.inventory > 0 : p.inventory === 0))
      .filter((p) => min_price === undefined || p.priceCents >= min_price)
      .filter((p) => max_price === undefined || p.priceCents <= max_price)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    let startIdx = 0;
    if (cursor) {
      const cursorIdx = filtered.findIndex((p) => p.id === cursor);
      if (cursorIdx === -1) {
        throw BadRequest("cursor not found — page may have shifted, restart from the beginning", { cursor });
      }
      startIdx = cursorIdx + 1;
    }

    const page = filtered.slice(startIdx, startIdx + limit);
    const nextCursor = page.length === limit && startIdx + limit < filtered.length ? page[page.length - 1].id : null;

    return { items: page, nextCursor };
  });

  app.get<{ Params: { id: string } }>("/products/:id", async (req) => {
    const p = products.get(req.params.id);
    if (!p) throw NotFound("product");
    return p;
  });

  app.get<{ Params: { slug: string } }>("/products/by-slug/:slug", async (req) => {
    const p = products.findBySlug(req.params.slug);
    if (!p) throw NotFound("product");
    return p;
  });

  app.post("/products", async (req, reply) => {
    const parse = CreateBody.safeParse(req.body);
    if (!parse.success) {
      throw BadRequest("invalid product body", parse.error.flatten());
    }
    const input = parse.data;

    const desiredSlug = input.slug ? slugify(input.slug) : slugify(input.title);
    if (!desiredSlug) {
      throw BadRequest("could not derive a valid slug from title", { title: input.title });
    }
    if (products.findBySlug(desiredSlug, { includeDeleted: true })) {
      throw Conflict("slug already in use", { slug: desiredSlug });
    }

    const now = new Date();
    const product: Product = {
      id: newProductId(),
      slug: desiredSlug,
      title: input.title,
      priceCents: input.priceCents,
      currency: input.currency,
      inventory: input.inventory ?? 0,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    products.create(product);
    reply.code(201).header("location", `/products/${product.id}`);
    return product;
  });

  app.patch<{ Params: { id: string } }>("/products/:id", async (req) => {
    const existing = products.get(req.params.id);
    if (!existing) throw NotFound("product");

    const parse = PatchBody.safeParse(req.body);
    if (!parse.success) {
      throw BadRequest("invalid patch body", parse.error.flatten());
    }
    const patch = parse.data;

    if (patch.slug && patch.slug !== existing.slug) {
      const normalized = slugify(patch.slug);
      if (!normalized) {
        throw BadRequest("invalid slug", { slug: patch.slug });
      }
      const collide = products.findBySlug(normalized, { includeDeleted: true });
      if (collide && collide.id !== existing.id) {
        throw Conflict("slug already in use", { slug: normalized });
      }
      patch.slug = normalized;
    }

    const updated = products.update(existing.id, patch);
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/products/:id", async (req, reply) => {
    const existing = products.get(req.params.id);
    if (!existing) throw NotFound("product");
    products.softDelete(existing.id);
    reply.code(204);
    return null;
  });

  app.post<{ Params: { id: string } }>("/products/:id/restore", async (req) => {
    const existing = products.get(req.params.id, { includeDeleted: true });
    if (!existing) throw NotFound("product");
    if (existing.deletedAt === null) {
      throw BadRequest("product is not deleted", { id: existing.id });
    }
    const restored = products.restore(existing.id);
    return restored;
  });
}
