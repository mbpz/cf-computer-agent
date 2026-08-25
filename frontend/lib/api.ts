export interface ApiError {
  code: string;
  message: string;
  status: number;
  retryable: boolean;
  requestId?: string;
}

export class ApiRequestError extends Error implements ApiError {
  readonly name = "ApiRequestError";
  constructor(readonly code: string, message: string, readonly status: number, readonly retryable: boolean, readonly requestId?: string) {
    super(message);
  }
}

export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type FrontendRequestInit = RequestInit & { requester?: Fetcher };

export async function parseApiError(response: Response): Promise<ApiError> {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  let body: unknown;
  try { body = await response.json(); } catch { body = undefined; }
  const error = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).error
    : undefined;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const record = error as Record<string, unknown>;
    if (typeof record.code === "string" && typeof record.message === "string" && typeof record.retryable === "boolean") {
      return {
        code: record.code,
        message: record.message,
        status: response.status,
        retryable: record.retryable,
        requestId: typeof record.requestId === "string" ? record.requestId : requestId,
      };
    }
  }
  return { code: "API_ERROR", message: "The request failed.", status: response.status, retryable: response.status >= 500, requestId };
}

export async function apiFetch<T>(path: string, init: FrontendRequestInit = {}): Promise<T> {
  const { requester = fetch, ...requestInit } = init;
  const response = await requester(path, { ...requestInit, credentials: "same-origin" });
  if (!response.ok) {
    const error = await parseApiError(response);
    throw new ApiRequestError(error.code, error.message, error.status, error.retryable, error.requestId);
  }
  if (response.status === 204) return undefined as T;
  try {
    return await response.json() as T;
  } catch {
    return undefined as T;
  }
}
