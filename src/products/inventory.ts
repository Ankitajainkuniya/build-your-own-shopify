import { variants } from "../variants/store";
import type { Product } from "./types";

/**
 * Total inventory for a product is the sum of its non-deleted variants' inventory.
 *
 * Lesson 14: inventory used to live on Product. Now Product is pure metadata
 * (title, price, tags); variants are the only place stock counts live.
 */
export function productInventory(productId: string): number {
  return variants.listForProduct(productId).reduce((sum, v) => sum + v.inventory, 0);
}

/**
 * Serialize a Product for an HTTP response, injecting the computed `inventory`
 * sum so clients (and our tests) see a single number.
 */
export function serializeProduct(p: Product): Product & { inventory: number } {
  return { ...p, inventory: productInventory(p.id) };
}
