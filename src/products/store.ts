import type { Product } from "./types";

const items = new Map<string, Product>();

export const products = {
  list(): Product[] {
    return Array.from(items.values());
  },
  get(id: string): Product | undefined {
    return items.get(id);
  },
  create(p: Product): Product {
    items.set(p.id, p);
    return p;
  },
  clear(): void {
    items.clear();
  },
};
