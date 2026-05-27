export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const NotFound = (resource: string): HttpError =>
  new HttpError(404, "not_found", `${resource} not found`);

export const BadRequest = (message: string, details?: unknown): HttpError =>
  new HttpError(400, "bad_request", message, details);

export const Conflict = (message: string, details?: unknown): HttpError =>
  new HttpError(409, "conflict", message, details);
