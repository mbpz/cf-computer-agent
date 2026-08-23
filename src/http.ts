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

export async function parseJsonRequest(request: Request, maxBytes: number): Promise<unknown> {
  if (!isJsonContentType(request.headers.get("content-type"))) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Content type must be application/json", 415);
  }

  const body = new TextDecoder().decode(await readBoundedBodyBytes(request, maxBytes));
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AppError("INVALID_JSON", "Request body must be valid JSON", 400);
    }
    throw error;
  }
}

export function jsonResponse(value: unknown, status = 200, requestId?: string): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
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

export function logRequestFailure(request: Request, context: RequestContext, error: unknown): void {
  const appError = error instanceof AppError ? error : undefined;
  console.error("request failed", {
    requestId: context.requestId,
    method: request.method,
    path: new URL(request.url).pathname,
    code: appError?.code || "INTERNAL_ERROR",
    status: appError?.status || 500,
  });
}

export function methodNotAllowed(allow: string, context: RequestContext): Response {
  const response = errorResponse(new AppError("METHOD_NOT_ALLOWED", "Method not allowed", 405), context.requestId);
  const headers = new Headers(response.headers);
  headers.set("allow", allow);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function requireSameOrigin(request: Request, canonicalOrigin: string): void {
  let configured: URL;
  try {
    configured = new URL(canonicalOrigin);
  } catch {
    throw new AppError("FORBIDDEN", "Forbidden", 403);
  }
  if (configured.protocol !== "https:"
    || configured.origin !== canonicalOrigin
    || request.headers.get("origin") !== canonicalOrigin) {
    throw new AppError("FORBIDDEN", "Forbidden", 403);
  }
}

export function decodePathId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new AppError("NOT_FOUND", "Not found", 404);
  }
}

export function requireNoQuery(url: URL): void {
  if ([...url.searchParams.keys()].length !== 0) {
    throw new AppError("REQUEST_QUERY_INVALID", "Query parameters are not accepted", 400);
  }
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

export async function readBoundedBodyBytes(
  request: Request,
  maxBytes: number,
  errorCode = "REQUEST_TOO_LARGE",
  errorMessage = "Request exceeds the JSON body limit",
): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    throw new AppError(errorCode, errorMessage, 413);
  }

  if (!request.body) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new AppError(errorCode, errorMessage, 413);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
