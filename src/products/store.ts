import type { Product } from "./types";

const items = new Map<string, Product>();

export interface ListOptions {
  includeDeleted?: boolean;
}

export const products = {
  list(opts: ListOptions = {}): Product[] {
    const all = Array.from(items.values());
    return opts.includeDeleted ? all : all.filter((p) => p.deletedAt === null);
  },
  get(id: string, opts: ListOptions = {}): Product | undefined {
    const p = items.get(id);
    if (!p) return undefined;
    if (!opts.includeDeleted && p.deletedAt !== null) return undefined;
    return p;
  },
  findBySlug(slug: string, opts: ListOptions = {}): Product | undefined {
    for (const p of items.values()) {
      if (p.slug !== slug) continue;
      if (!opts.includeDeleted && p.deletedAt !== null) continue;
      return p;
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
  softDelete(id: string): Product | undefined {
    const existing = items.get(id);
    if (!existing || existing.deletedAt !== null) return undefined;
    const next: Product = { ...existing, deletedAt: new Date(), updatedAt: new Date() };
    items.set(id, next);
    return next;
  },
  restore(id: string): Product | undefined {
    const existing = items.get(id);
    if (!existing || existing.deletedAt === null) return undefined;
    const next: Product = { ...existing, deletedAt: null, updatedAt: new Date() };
    items.set(id, next);
    return next;
  },
  clear(): void {
    items.clear();
  },
};
