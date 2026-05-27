export type Currency = "USD" | "EUR" | "INR";

export interface Product {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  currency: Currency;
  inventory: number;
  createdAt: Date;
}
