export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
  }
}

export interface RequestContext {
  requestId: string;
}

export const createRequestContext = (request: Request): RequestContext => ({
  requestId: request.headers.get("cf-ray") || crypto.randomUUID(),
});

export function jsonResponse(value: unknown, status = 200, requestId?: string): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
  });
}

export function errorResponse(error: unknown, requestId: string): Response {
  const app = error instanceof AppError
    ? error
    : new AppError("INTERNAL_ERROR", "Internal error", 500, true);
  return jsonResponse({
    error: { code: app.code, message: app.message, retryable: app.retryable, requestId },
  }, app.status, requestId);
}
