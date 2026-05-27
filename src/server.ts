import Fastify, { type FastifyInstance } from "fastify";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || "info" },
    genReqId: () => `req_${Math.random().toString(36).slice(2, 11)}`,
  });

  app.get("/health", async () => ({ ok: true }));

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
