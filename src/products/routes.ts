import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { BadRequest, Conflict, NotFound } from "../errors";
import { slugify } from "./slug";
import { products } from "./store";
import type { Product } from "./types";

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(100).optional(),
});

const CreateBody = z.object({
  title: z.string().trim().min(1).max(200),
  priceCents: z.number().int().min(0),
  currency: z.enum(["USD", "EUR", "INR"]),
  inventory: z.number().int().min(0).optional(),
  slug: z.string().trim().min(1).max(100).optional(),
});

const PatchBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  priceCents: z.number().int().min(0).optional(),
  currency: z.enum(["USD", "EUR", "INR"]).optional(),
  inventory: z.number().int().min(0).optional(),
  slug: z.string().trim().min(1).max(100).optional(),
}).strict();

const newProductId = (): string => `p_${randomBytes(6).toString("base64url")}`;

export async function registerProductRoutes(app: FastifyInstance): Promise<void> {
  app.get("/products", async (req) => {
    const parse = ListQuery.safeParse(req.query);
    if (!parse.success) {
      throw BadRequest("invalid query parameters", parse.error.flatten());
    }
    const { limit, search } = parse.data;
    const items = products
      .list()
      .filter((p) => !search || p.title.toLowerCase().includes(search.toLowerCase()))
      .slice(0, limit);
    return { items };
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
    if (products.findBySlug(desiredSlug)) {
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
      createdAt: now,
      updatedAt: now,
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
      const collide = products.findBySlug(normalized);
      if (collide && collide.id !== existing.id) {
        throw Conflict("slug already in use", { slug: normalized });
      }
      patch.slug = normalized;
    }

    const updated = products.update(existing.id, patch);
    return updated;
  });
}
