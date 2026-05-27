import { products } from "./store";

export function seedProducts(): void {
  products.clear();
  const now = new Date();
  products.create({
    id: "p_1",
    slug: "linen-shirt",
    title: "Linen Shirt",
    priceCents: 6900,
    currency: "USD",
    inventory: 24,
    createdAt: now,
  });
  products.create({
    id: "p_2",
    slug: "ceramic-mug",
    title: "Ceramic Mug",
    priceCents: 1800,
    currency: "USD",
    inventory: 200,
    createdAt: now,
  });
  products.create({
    id: "p_3",
    slug: "leather-wallet",
    title: "Leather Wallet",
    priceCents: 8500,
    currency: "USD",
    inventory: 0,
    createdAt: now,
  });
}
