# Lesson 4 — Errors and structured logging

**Goal:** Replace Fastify's default "500 Internal Server Error, no details" with a typed error system and a JSON error envelope. Every error logs with a `requestId` so we can trace one request through the stack.

**Files:**

- `src/errors.ts` (new)
- `src/server.ts` (modified — register error handler, add `requestId`)

## What we did

```ts
// errors.ts
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) { super(message); }
}

export const NotFound = (resource: string) =>
  new HttpError(404, "not_found", `${resource} not found`);

export const BadRequest = (message: string, details?: unknown) =>
  new HttpError(400, "bad_request", message, details);
```

And in `server.ts`:

```ts
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
```

## Three rules that matter forever

1. **Never leak internal error messages to clients on 5xx.** Stack traces, raw exception messages, and SQL errors are gifts to attackers. Generic 5xx response, log the details server-side, give the user a `requestId` they can quote.

2. **Every error response includes a `requestId`.** Then in your logs you can `grep <requestId>` and reconstruct what happened. Without this, every support ticket is a forensic exercise.

3. **`HttpError` is the only error you `throw` deliberately.** Everything else is a bug — and bugs should hit the unhandled-error branch with a 500. If you `throw new Error("not found")`, your 404 will be a 500.

## What we deliberately skipped

- **Sentry / error tracking.** Lesson 8 (alongside graceful shutdown — they go together).
- **Rate limiting.** A 429-style error code. Lesson 11.
- **Error code taxonomy.** What should our `code` strings be? We'll pin this down in lesson 7 when we add OpenAPI schemas.

## Exercises

1. Throw `NotFound("product")` from inside `GET /products/:id`. Curl the endpoint with a fake id. Verify the JSON envelope.
2. Throw `new Error("kaboom")` (plain) from the same handler. Verify you get a 500 and the `requestId` matches what's in the logs.
3. The error handler logs `req.log.warn` for `HttpError` and `req.log.error` for unhandled. Why warn vs error? When would you escalate a 4xx to error level? (Hint: spike detection, abuse signals.)

## Next

Lesson 5 — validate inputs with Zod, so bad requests fail at the boundary, not deep in your code.
