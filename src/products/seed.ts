import { randomBytes } from "node:crypto";

import { variants } from "../variants/store";
import type { Variant } from "../variants/types";
import { products } from "./store";

function seedDefaultVariant(productId: string, sku: string, inventory: number): Variant {
  const now = new Date();
  const variant: Variant = {
    id: `v_${randomBytes(6).toString("base64url")}`,
    productId,
    sku,
    title: "Default",
    priceCents: null,
    inventory,
    optionValues: {},
    position: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  variants.create(variant);
  return variant;
}

export function seedProducts(): void {
  products.clear();
  variants.clear();
  const now = new Date();

  products.create({
    id: "p_1",
    slug: "linen-shirt",
    title: "Linen Shirt",
    priceCents: 6900,
    currency: "USD",
    tags: ["apparel", "summer"],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    options: [],
  });
  seedDefaultVariant("p_1", "LINEN-DEFAULT", 24);

  products.create({
    id: "p_2",
    slug: "ceramic-mug",
    title: "Ceramic Mug",
    priceCents: 1800,
    currency: "USD",
    tags: ["home", "kitchen", "sale"],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    options: [],
  });
  seedDefaultVariant("p_2", "MUG-DEFAULT", 200);

  products.create({
    id: "p_3",
    slug: "leather-wallet",
    title: "Leather Wallet",
    priceCents: 8500,
    currency: "USD",
    tags: ["accessories", "leather"],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    options: [],
  });
  seedDefaultVariant("p_3", "WALLET-DEFAULT", 0);
}
