import type { Product } from "./types";

const items = new Map<string, Product>();
const slugIndex = new Map<string, string>();
const tagIndex = new Map<string, Set<string>>();

export interface ListOptions {
  includeDeleted?: boolean;
}

function _addToIndexes(p: Product): void {
  slugIndex.set(p.slug, p.id);
  for (const tag of p.tags) {
    let bucket = tagIndex.get(tag);
    if (!bucket) {
      bucket = new Set();
      tagIndex.set(tag, bucket);
    }
    bucket.add(p.id);
  }
}

function _removeFromIndexes(p: Product): void {
  if (slugIndex.get(p.slug) === p.id) {
    slugIndex.delete(p.slug);
  }
  for (const tag of p.tags) {
    const bucket = tagIndex.get(tag);
    if (bucket) {
      bucket.delete(p.id);
      if (bucket.size === 0) tagIndex.delete(tag);
    }
  }
}

function _isVisible(p: Product, opts: ListOptions): boolean {
  return opts.includeDeleted ? true : p.deletedAt === null;
}

export const products = {
  list(opts: ListOptions = {}): Product[] {
    const all = Array.from(items.values());
    return opts.includeDeleted ? all : all.filter((p) => p.deletedAt === null);
  },

  get(id: string, opts: ListOptions = {}): Product | undefined {
    const p = items.get(id);
    if (!p) return undefined;
    if (!_isVisible(p, opts)) return undefined;
    return p;
  },

  findBySlug(slug: string, opts: ListOptions = {}): Product | undefined {
    const id = slugIndex.get(slug);
    if (!id) return undefined;
    const p = items.get(id);
    if (!p || !_isVisible(p, opts)) return undefined;
    return p;
  },

  findByTag(tag: string, opts: ListOptions = {}): Product[] {
    const bucket = tagIndex.get(tag);
    if (!bucket) return [];
    const out: Product[] = [];
    for (const id of bucket) {
      const p = items.get(id);
      if (p && _isVisible(p, opts)) out.push(p);
    }
    return out;
  },

  create(p: Product): Product {
    items.set(p.id, p);
    _addToIndexes(p);
    return p;
  },

  update(id: string, patch: Partial<Product>): Product | undefined {
    const existing = items.get(id);
    if (!existing) return undefined;
    _removeFromIndexes(existing);
    const next: Product = { ...existing, ...patch, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date() };
    items.set(id, next);
    _addToIndexes(next);
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
    slugIndex.clear();
    tagIndex.clear();
  },

  _debugIndexes() {
    return {
      slugIndexSize: slugIndex.size,
      tagIndexSize: tagIndex.size,
      tagBuckets: Array.from(tagIndex.keys()),
    };
  },
};
