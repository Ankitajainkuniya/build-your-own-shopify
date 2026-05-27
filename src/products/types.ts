export type Currency = "USD" | "EUR" | "INR";

export interface Product {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  currency: Currency;
  tags: string[];
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
