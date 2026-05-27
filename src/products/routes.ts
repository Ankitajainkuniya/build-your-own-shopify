import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { BadRequest, Conflict, NotFound } from "../errors";
import { variants } from "../variants/store";
import type { Variant } from "../variants/types";
import { productInventory, serializeProduct } from "./inventory";
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
  slug: z.string().trim().min(1).max(100).optional(),
  tags: TagList.optional(),
}).strict();

const newProductId = (): string => `p_${randomBytes(6).toString("base64url")}`;
const newVariantId = (): string => `v_${randomBytes(6).toString("base64url")}`;

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
      .filter((p) => {
        if (in_stock === undefined) return true;
        const stock = productInventory(p.id);
        return in_stock ? stock > 0 : stock === 0;
      })
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

    return { items: page.map(serializeProduct), nextCursor };
  });

  app.get<{ Params: { id: string } }>("/products/:id", async (req) => {
    const p = products.get(req.params.id);
    if (!p) throw NotFound("product");
    return serializeProduct(p);
  });

  app.get<{ Params: { slug: string } }>("/products/by-slug/:slug", async (req) => {
    const p = products.findBySlug(req.params.slug);
    if (!p) throw NotFound("product");
    return serializeProduct(p);
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
      tags: input.tags ?? [],
      options: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    products.create(product);

    const defaultVariant: Variant = {
      id: newVariantId(),
      productId: product.id,
      sku: null,
      title: "Default",
      priceCents: null,
      inventory: input.inventory ?? 0,
      optionValues: {},
      position: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    variants.create(defaultVariant);

    reply.code(201).header("location", `/products/${product.id}`);
    return serializeProduct(product);
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
    return updated ? serializeProduct(updated) : undefined;
  });

  app.delete<{ Params: { id: string } }>("/products/:id", async (req, reply) => {
    const existing = products.get(req.params.id);
    if (!existing) throw NotFound("product");
    products.softDelete(existing.id);
    reply.code(204);
    return null;
  });

  const OptionBody = z.object({
    name: z.string().trim().min(1).max(50),
    values: z.array(z.string().trim().min(1).max(50)).min(1).max(50),
  });

  app.post<{ Params: { id: string } }>("/products/:id/options", async (req) => {
    const product = products.get(req.params.id);
    if (!product) throw NotFound("product");

    const parse = OptionBody.safeParse(req.body);
    if (!parse.success) throw BadRequest("invalid option body", parse.error.flatten());
    const { name, values } = parse.data;

    const uniqueValues = Array.from(new Set(values));
    if (uniqueValues.length !== values.length) {
      throw BadRequest("option values must be unique", { values });
    }

    const existingOptions = product.options ?? [];
    const idx = existingOptions.findIndex((o) => o.name === name);
    const nextOptions = [...existingOptions];
    if (idx === -1) {
      nextOptions.push({ name, values: uniqueValues, position: existingOptions.length });
    } else {
      nextOptions[idx] = { ...nextOptions[idx], values: uniqueValues };
    }

    const updated = products.update(product.id, { options: nextOptions });
    return updated ? serializeProduct(updated) : undefined;
  });

  app.delete<{ Params: { id: string; optionName: string } }>(
    "/products/:id/options/:optionName",
    async (req, reply) => {
      const product = products.get(req.params.id);
      if (!product) throw NotFound("product");
      const next = (product.options ?? []).filter((o) => o.name !== req.params.optionName);
      if (next.length === (product.options ?? []).length) throw NotFound("option");
      products.update(product.id, {
        options: next.map((o, i) => ({ ...o, position: i })),
      });
      reply.code(204);
      return null;
    },
  );

  app.post<{ Params: { id: string } }>("/products/:id/generate-variants", async (req) => {
    const product = products.get(req.params.id);
    if (!product) throw NotFound("product");

    const options = [...(product.options ?? [])].sort((a, b) => a.position - b.position);
    if (options.length === 0) {
      throw BadRequest("product has no options to generate variants from", { id: product.id });
    }

    const combinations = options.reduce<Record<string, string>[]>(
      (acc, option) =>
        acc.flatMap((partial) =>
          option.values.map((value) => ({ ...partial, [option.name]: value })),
        ),
      [{}],
    );

    if (combinations.length > 100) {
      throw BadRequest("refusing to generate more than 100 variants in a single call", {
        attempted: combinations.length,
      });
    }

    const existing = variants.listForProduct(product.id);
    const existingFingerprints = new Set(
      existing.map((v) => JSON.stringify(v.optionValues, Object.keys(v.optionValues).sort())),
    );

    const created: Variant[] = [];
    const skipped: Record<string, string>[] = [];
    const now = new Date();

    for (const combo of combinations) {
      const fingerprint = JSON.stringify(combo, Object.keys(combo).sort());
      if (existingFingerprints.has(fingerprint)) {
        skipped.push(combo);
        continue;
      }
      const v: Variant = {
        id: newVariantId(),
        productId: product.id,
        sku: null,
        title: Object.values(combo).join(" / "),
        priceCents: null,
        inventory: 0,
        optionValues: combo,
        position: existing.length + created.length,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      variants.create(v);
      created.push(v);
      existingFingerprints.add(fingerprint);
    }

    return { created, skipped, total: combinations.length };
  });

  app.post<{ Params: { id: string } }>("/products/:id/restore", async (req) => {
    const existing = products.get(req.params.id, { includeDeleted: true });
    if (!existing) throw NotFound("product");
    if (existing.deletedAt === null) {
      throw BadRequest("product is not deleted", { id: existing.id });
    }
    const restored = products.restore(existing.id);
    return restored ? serializeProduct(restored) : undefined;
  });
}
