export type Currency = "USD" | "EUR" | "INR";

export interface Product {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  currency: Currency;
  inventory: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductInput {
  title: string;
  priceCents: number;
  currency: Currency;
  inventory?: number;
  slug?: string;
}
