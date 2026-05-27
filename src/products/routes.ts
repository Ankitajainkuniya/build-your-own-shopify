import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { BadRequest, NotFound } from "../errors";
import { products } from "./store";

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(100).optional(),
});

export async function registerProductRoutes(app: FastifyInstance): Promise<void> {
  app.get("/products", async (req) => {
    const parse = ListQuery.safeParse(req.query);
    if (!parse.success) {
      throw BadRequest("invalid query parameters", parse.error.flatten());
    }
    const { limit, search } = parse.data;
    const items = products
      .list()
      .filter((p) => !search || p.title.toLowerCase().includes(search.toLowerCase()))
      .slice(0, limit);
    return { items };
  });

  app.get<{ Params: { id: string } }>("/products/:id", async (req) => {
    const p = products.get(req.params.id);
    if (!p) throw NotFound("product");
    return p;
  });
}
