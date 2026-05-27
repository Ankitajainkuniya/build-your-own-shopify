import type { FastifyInstance } from "fastify";

import { products } from "./store";

export async function registerProductRoutes(app: FastifyInstance): Promise<void> {
  app.get("/products", async () => {
    return { items: products.list() };
  });

  app.get<{ Params: { id: string } }>("/products/:id", async (req, reply) => {
    const p = products.get(req.params.id);
    if (!p) {
      reply.code(404);
      return { error: "product not found" };
    }
    return p;
  });
}
