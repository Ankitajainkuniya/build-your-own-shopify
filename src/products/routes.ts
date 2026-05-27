import type { FastifyInstance } from "fastify";

import { NotFound } from "../errors";
import { products } from "./store";

export async function registerProductRoutes(app: FastifyInstance): Promise<void> {
  app.get("/products", async () => {
    return { items: products.list() };
  });

  app.get<{ Params: { id: string } }>("/products/:id", async (req) => {
    const p = products.get(req.params.id);
    if (!p) throw NotFound("product");
    return p;
  });
}
