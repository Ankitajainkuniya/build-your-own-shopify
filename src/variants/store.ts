import type { Variant } from "./types";

const items = new Map<string, Variant>();
const byProduct = new Map<string, Set<string>>();
const skuIndex = new Map<string, string>();

export interface ListOptions {
  includeDeleted?: boolean;
}

function _visible(v: Variant, opts: ListOptions): boolean {
  return opts.includeDeleted ? true : v.deletedAt === null;
}

function _addToIndexes(v: Variant): void {
  let bucket = byProduct.get(v.productId);
  if (!bucket) {
    bucket = new Set();
    byProduct.set(v.productId, bucket);
  }
  bucket.add(v.id);
  if (v.sku) skuIndex.set(v.sku, v.id);
}

function _removeFromIndexes(v: Variant): void {
  byProduct.get(v.productId)?.delete(v.id);
  if (v.sku && skuIndex.get(v.sku) === v.id) skuIndex.delete(v.sku);
}

export const variants = {
  listForProduct(productId: string, opts: ListOptions = {}): Variant[] {
    const bucket = byProduct.get(productId);
    if (!bucket) return [];
    const out: Variant[] = [];
    for (const id of bucket) {
      const v = items.get(id);
      if (v && _visible(v, opts)) out.push(v);
    }
    return out.sort((a, b) => a.position - b.position);
  },

  get(id: string, opts: ListOptions = {}): Variant | undefined {
    const v = items.get(id);
    if (!v) return undefined;
    return _visible(v, opts) ? v : undefined;
  },

  findBySku(sku: string, opts: ListOptions = {}): Variant | undefined {
    const id = skuIndex.get(sku);
    if (!id) return undefined;
    const v = items.get(id);
    if (!v || !_visible(v, opts)) return undefined;
    return v;
  },

  create(v: Variant): Variant {
    items.set(v.id, v);
    _addToIndexes(v);
    return v;
  },

  update(id: string, patch: Partial<Variant>): Variant | undefined {
    const existing = items.get(id);
    if (!existing) return undefined;
    _removeFromIndexes(existing);
    const next: Variant = {
      ...existing,
      ...patch,
      id: existing.id,
      productId: existing.productId,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };
    items.set(id, next);
    _addToIndexes(next);
    return next;
  },

  softDelete(id: string): Variant | undefined {
    const existing = items.get(id);
    if (!existing || existing.deletedAt !== null) return undefined;
    const next: Variant = { ...existing, deletedAt: new Date(), updatedAt: new Date() };
    items.set(id, next);
    return next;
  },

  clear(): void {
    items.clear();
    byProduct.clear();
    skuIndex.clear();
  },
};
