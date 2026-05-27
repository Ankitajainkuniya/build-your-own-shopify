# Lesson 1 — An empty server

**Goal:** Get a Fastify server listening on a port. Hit `/health` and get `{ "ok": true }` back.

**Files:**

- `src/server.ts`

## What we did

Fastify (not Express, not Koa, not Nest) for three reasons:

1. **Speed.** It's measurably faster than Express and Koa for the request lifecycle that matters for commerce — many small JSON requests.
2. **Less magic than Nest.** Nest is great for big teams that benefit from opinionated structure, but it hides where the request actually goes. For a course, you want to see the path.
3. **Built-in logger.** Pino is bundled. We get structured logs from request 1 without configuring anything.

```ts
import Fastify from "fastify";

const app = Fastify({ logger: true });
app.get("/health", async () => ({ ok: true }));

const PORT = Number(process.env.PORT) || 3000;
await app.listen({ port: PORT, host: "0.0.0.0" });
```

## What we deliberately skipped

- **A health check that actually checks things.** Real health endpoints verify DB connectivity, queue health, downstream API reachability. We'll add this in lesson 10 once we have something to check.
- **Graceful shutdown.** `app.close()` on `SIGTERM`. Important for production behind a load balancer. Lesson 8.
- **Environment validation.** Right now `PORT` defaults silently. We'll catch this with Zod-validated env in lesson 5.

## Try it

```bash
npm install
npm run dev
# then in another terminal:
curl http://localhost:3000/health
```

You should see `{"ok":true}` and a Pino log line for the request.

## Exercises

1. Add a second route `GET /` that returns the current ISO timestamp. Notice that you don't need to reset the server thanks to `tsx watch`.
2. Make the server respond to `GET /health` with a `200` status code explicitly, even though Fastify defaults to it. Use `reply.code(200).send(...)`. Why might you want to be explicit?
3. Kill the server with `Ctrl+C` and watch the logs. Does it shut down cleanly? (Spoiler: not yet. We fix this in lesson 8.)

## Next

Lesson 2 — define what a "product" actually is. Type-first.
