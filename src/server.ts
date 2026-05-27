import Fastify, { type FastifyInstance } from "fastify";

import { HttpError } from "./errors";
import { registerProductRoutes } from "./products/routes";
import { seedProducts } from "./products/seed";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || "info" },
    genReqId: () => `req_${Math.random().toString(36).slice(2, 11)}`,
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      req.log.warn({ err, requestId: req.id }, "http error");
      return reply.code(err.statusCode).send({
        error: { code: err.code, message: err.message, details: err.details },
        requestId: req.id,
      });
    }
    req.log.error({ err, requestId: req.id }, "unhandled error");
    return reply.code(500).send({
      error: { code: "internal_error", message: "Something went wrong." },
      requestId: req.id,
    });
  });

  app.get("/health", async () => ({ ok: true }));

  seedProducts();
  await registerProductRoutes(app);

  return app;
}

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1] ?? "");

if (isMainModule) {
  const PORT = Number(process.env.PORT) || 3000;
  buildApp()
    .then((app) =>
      app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
        app.log.info(`build-your-own-shopify listening on ${PORT}`);
      }),
    )
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
