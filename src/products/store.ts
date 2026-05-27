import type { Product } from "./types";

const items = new Map<string, Product>();

export const products = {
  list(): Product[] {
    return Array.from(items.values());
  },
  get(id: string): Product | undefined {
    return items.get(id);
  },
  findBySlug(slug: string): Product | undefined {
    for (const p of items.values()) {
      if (p.slug === slug) return p;
    }
    return undefined;
  },
  create(p: Product): Product {
    items.set(p.id, p);
    return p;
  },
  clear(): void {
    items.clear();
  },
};
