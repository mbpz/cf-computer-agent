export const supportedPageSizes = [20, 50, 100] as const;
export type SupportedPageSize = typeof supportedPageSizes[number];
export interface FrontendPageRequest { page: number; pageSize: SupportedPageSize; }
export interface FrontendPageMetadata extends FrontendPageRequest { total: number; totalPages: number; }
export interface FrontendNumberedPage<T> { items: T[]; pagination: FrontendPageMetadata; }

const defaults: FrontendPageRequest = { page: 1, pageSize: 20 };

export function parsePageSearch(search: string): FrontendPageRequest {
  const params = new URLSearchParams(search);
  const pageValues = params.getAll("page");
  const pageSizeValues = params.getAll("pageSize");
  const page = pageValues.length === 1 ? parsePositiveInteger(pageValues[0]!) : defaults.page;
  const parsedPageSize = pageSizeValues.length === 1 ? parsePositiveInteger(pageSizeValues[0]!) : defaults.pageSize;
  const pageSize = isSupportedPageSize(parsedPageSize) ? parsedPageSize : defaults.pageSize;
  const offset = (page - 1) * pageSize;
  return { page: Number.isSafeInteger(offset) && offset < 10_000 ? page : defaults.page, pageSize };
}

export function writePageSearch(search: string, next: FrontendPageRequest): string {
  assertPageRequest(next);
  const params = new URLSearchParams(search);
  params.delete("page");
  params.delete("pageSize");
  if (next.page !== defaults.page) params.set("page", String(next.page));
  if (next.pageSize !== defaults.pageSize) params.set("pageSize", String(next.pageSize));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function normalizeNumberedPage<T>(value: unknown, normalizeItem: (value: unknown) => T): FrontendNumberedPage<T> {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.pagination)) invalidResponse();
  const { page, pageSize, total, totalPages } = value.pagination;
  const offset = typeof page === "number" && typeof pageSize === "number" ? (page - 1) * pageSize : Number.NaN;
  const maximumRows = typeof total === "number" && Number.isFinite(offset) ? Math.max(0, Math.min(pageSize as number, total - offset)) : 0;
  if (!isPositiveSafeInteger(page) || !isSupportedPageSize(pageSize) || !isNonNegativeSafeInteger(total) || !isNonNegativeSafeInteger(totalPages) || !Number.isSafeInteger(offset) || offset >= 10_000 || totalPages !== (total === 0 ? 0 : Math.ceil(total / pageSize)) || value.items.length > maximumRows || (page > totalPages && value.items.length > 0)) invalidResponse();
  let items: T[];
  try { items = value.items.map(normalizeItem); } catch { invalidResponse(); }
  return { items: items!, pagination: { page, pageSize, total, totalPages } };
}

type NumberedRequester<TInput, TResult> = (input: TInput, signal: AbortSignal) => Promise<TResult>;

export function createNumberedRequestController<TInput, TResult>(requester: NumberedRequester<TInput, TResult>) {
  let active: AbortController | null = null;
  let generation = 0;
  let disposed = false;
  return {
    request(input: TInput) {
      if (disposed) throw new Error("NUMBERED_REQUEST_CONTROLLER_DISPOSED");
      active?.abort();
      active = new AbortController();
      generation += 1;
      const requestGeneration = generation;
      return { generation: requestGeneration, promise: requester(input, active.signal) };
    },
    isCurrent(candidate: number) { return !disposed && candidate === generation; },
    dispose() { disposed = true; generation += 1; active?.abort(); active = null; },
  };
}

function parsePositiveInteger(value: string): number { if (!/^[1-9]\d*$/u.test(value)) return 1; const parsed = Number(value); return Number.isSafeInteger(parsed) ? parsed : 1; }
function isSupportedPageSize(value: unknown): value is SupportedPageSize { return typeof value === "number" && supportedPageSizes.includes(value as SupportedPageSize); }
function isPositiveSafeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function isNonNegativeSafeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function assertPageRequest(request: FrontendPageRequest): void { const offset = (request.page - 1) * request.pageSize; if (!isPositiveSafeInteger(request.page) || !isSupportedPageSize(request.pageSize) || !Number.isSafeInteger(offset) || offset >= 10_000) throw new Error("NUMBERED_PAGE_REQUEST_INVALID"); }
function invalidResponse(): never { throw new Error("NUMBERED_PAGE_RESPONSE_INVALID"); }
