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
  update(id: string, patch: Partial<Product>): Product | undefined {
    const existing = items.get(id);
    if (!existing) return undefined;
    const next: Product = { ...existing, ...patch, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date() };
    items.set(id, next);
    return next;
  },
  clear(): void {
    items.clear();
  },
};
