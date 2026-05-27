export interface Variant {
  id: string;
  productId: string;
  sku: string | null;
  title: string;
  priceCents: number | null;
  inventory: number;
  optionValues: Record<string, string>;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
