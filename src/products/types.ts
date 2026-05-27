export type Currency = "USD" | "EUR" | "INR";

export interface ProductOption {
  name: string;
  values: string[];
  position: number;
}

export interface Product {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  currency: Currency;
  tags: string[];
  options: ProductOption[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateProductInput {
  title: string;
  priceCents: number;
  currency: Currency;
  inventory?: number;
  slug?: string;
}
