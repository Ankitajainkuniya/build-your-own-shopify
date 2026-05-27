import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { BadRequest, Conflict, NotFound } from "../errors";
import { products } from "../products/store";
import { variants } from "./store";
import type { Variant } from "./types";

const OptionValues = z.record(z.string().trim().min(1).max(50), z.string().trim().min(1).max(50));

const CreateVariantBody = z.object({
  sku: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  inventory: z.number().int().min(0).optional(),
  optionValues: OptionValues.optional(),
});

const PatchVariantBody = z.object({
  sku: z.string().trim().min(1).max(80).nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  inventory: z.number().int().min(0).optional(),
  optionValues: OptionValues.optional(),
  position: z.number().int().min(0).optional(),
}).strict();

const newVariantId = (): string => `v_${randomBytes(6).toString("base64url")}`;

function _variantTitleFromValues(values: Record<string, string>): string {
  const parts = Object.values(values);
  return parts.length ? parts.join(" / ") : "Default";
}

export async function registerVariantRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/products/:id/variants", async (req) => {
    const product = products.get(req.params.id);
    if (!product) throw NotFound("product");
    return { items: variants.listForProduct(product.id) };
  });

  app.get<{ Params: { id: string; variantId: string } }>(
    "/products/:id/variants/:variantId",
    async (req) => {
      const product = products.get(req.params.id);
      if (!product) throw NotFound("product");
      const v = variants.get(req.params.variantId);
      if (!v || v.productId !== product.id) throw NotFound("variant");
      return v;
    },
  );

  app.post<{ Params: { id: string } }>("/products/:id/variants", async (req, reply) => {
    const product = products.get(req.params.id);
    if (!product) throw NotFound("product");

    const parse = CreateVariantBody.safeParse(req.body);
    if (!parse.success) throw BadRequest("invalid variant body", parse.error.flatten());
    const input = parse.data;

    if (input.sku && variants.findBySku(input.sku, { includeDeleted: true })) {
      throw Conflict("sku already in use", { sku: input.sku });
    }

    const optionValues = input.optionValues ?? {};
    const existing = variants.listForProduct(product.id);
    const collision = existing.find(
      (v) => JSON.stringify(v.optionValues) === JSON.stringify(optionValues),
    );
    if (collision) {
      throw Conflict("variant with this option combination already exists", {
        existingVariantId: collision.id,
      });
    }

    const now = new Date();
    const variant: Variant = {
      id: newVariantId(),
      productId: product.id,
      sku: input.sku ?? null,
      title: input.title ?? _variantTitleFromValues(optionValues),
      priceCents: input.priceCents ?? null,
      inventory: input.inventory ?? 0,
      optionValues,
      position: existing.length,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    variants.create(variant);
    reply.code(201).header("location", `/products/${product.id}/variants/${variant.id}`);
    return variant;
  });

  app.patch<{ Params: { id: string; variantId: string } }>(
    "/products/:id/variants/:variantId",
    async (req) => {
      const product = products.get(req.params.id);
      if (!product) throw NotFound("product");
      const existing = variants.get(req.params.variantId);
      if (!existing || existing.productId !== product.id) throw NotFound("variant");

      const parse = PatchVariantBody.safeParse(req.body);
      if (!parse.success) throw BadRequest("invalid variant body", parse.error.flatten());
      const patch = parse.data;

      if (patch.sku && patch.sku !== existing.sku) {
        const collide = variants.findBySku(patch.sku, { includeDeleted: true });
        if (collide && collide.id !== existing.id) {
          throw Conflict("sku already in use", { sku: patch.sku });
        }
      }

      return variants.update(existing.id, patch);
    },
  );

  app.delete<{ Params: { id: string; variantId: string } }>(
    "/products/:id/variants/:variantId",
    async (req, reply) => {
      const product = products.get(req.params.id);
      if (!product) throw NotFound("product");
      const existing = variants.get(req.params.variantId);
      if (!existing || existing.productId !== product.id) throw NotFound("variant");
      variants.softDelete(existing.id);
      reply.code(204);
      return null;
    },
  );
}
