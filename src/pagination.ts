import { AppError } from "./http";

export interface PageRequest { limit: number; cursor?: string; }
export interface Page<T> { items: T[]; nextCursor?: string; }
export interface PageCursor { sort: number; id: string; }
export interface PageCursorBounds { minSort?: number; maxSort?: number; }
export type CursorScope = Readonly<Record<string, string | number | boolean | null>>;

export const supportedPageSizes = [20, 50, 100] as const;
export type SupportedPageSize = typeof supportedPageSizes[number];
export interface NumberedPageRequest { page: number; pageSize: SupportedPageSize; }
export interface PageMetadata extends NumberedPageRequest { total: number; totalPages: number; }
export interface NumberedPage<T> { items: T[]; pagination: PageMetadata; }

const defaultPageLimit = 20;
const maxPageLimit = 50;
const maxCursorLength = 512;
const maxNumberedPageOffset = 10_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function parsePageRequest(limit: number = defaultPageLimit, cursor?: string): PageRequest {
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1 || limit > maxPageLimit) {
    throw new AppError("PAGE_INVALID", "Page limit must be an integer from 1 to 50", 400);
  }
  return cursor === undefined ? { limit } : { limit, cursor };
}

export function parseNumberedPageRequest(
  url: URL,
  allowedFilterKeys: readonly string[],
  errorCode = "PAGE_INVALID",
): NumberedPageRequest {
  const allowedKeys = new Set(["page", "pageSize", ...allowedFilterKeys]);
  for (const key of url.searchParams.keys()) {
    if (!allowedKeys.has(key) || url.searchParams.getAll(key).length !== 1) throw invalidNumberedPage(errorCode);
  }

  const page = parsePositiveInteger(url.searchParams.get("page"), 1, errorCode);
  const requestedPageSize = parsePositiveInteger(url.searchParams.get("pageSize"), 20, errorCode);
  if (!supportedPageSizes.includes(requestedPageSize as SupportedPageSize)) throw invalidNumberedPage(errorCode);

  const request: NumberedPageRequest = { page, pageSize: requestedPageSize as SupportedPageSize };
  pageOffset(request, errorCode);
  return request;
}

export function pageOffset(request: NumberedPageRequest, errorCode = "PAGE_INVALID"): number {
  const offset = (request.page - 1) * request.pageSize;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= maxNumberedPageOffset) {
    throw new AppError(errorCode, "Page is outside the query window", 400);
  }
  return offset;
}

export function buildPageMetadata(request: NumberedPageRequest, total: number): PageMetadata {
  if (!Number.isSafeInteger(request.page) || request.page < 1
    || !supportedPageSizes.includes(request.pageSize)) throw invalidNumberedPage("PAGE_INVALID");
  pageOffset(request);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new AppError("PAGE_RESULT_INVALID", "Pagination total is invalid", 500);
  }
  return {
    ...request,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / request.pageSize),
  };
}

export function encodeOpaqueCursor(value: unknown): string {
  return bytesToBase64Url(encoder.encode(JSON.stringify(value)));
}

export function decodeOpaqueCursor(cursor: string): unknown {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.length > maxCursorLength || cursor.length % 4 === 1) throw new Error();
    const value = JSON.parse(decoder.decode(base64UrlToBytes(cursor))) as unknown;
    if (encodeOpaqueCursor(value) !== cursor) throw new Error();
    return value;
  } catch {
    throw new AppError("PAGE_CURSOR_INVALID", "Page cursor is invalid", 400);
  }
}

export async function deriveCursorScopeKey(kind: string, scope: CursorScope): Promise<string> {
  const canonicalScope = Object.fromEntries(
    Object.entries(scope).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
  );
  const bytes = encoder.encode(JSON.stringify({ v: 1, kind, scope: canonicalScope }));
  const digest = await crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function encodePageCursor(cursor: PageCursor): string { return encodeOpaqueCursor({ v: 1, sort: cursor.sort, id: cursor.id }); }

export function decodePageCursor(cursor: string, bounds: PageCursorBounds = {}): PageCursor {
  const decoded = decodeOpaqueCursor(cursor);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw invalidCursor();
  const { v, sort, id } = decoded as Record<string, unknown>;
  if (v !== 1 || typeof sort !== "number" || !Number.isSafeInteger(sort) || typeof id !== "string" || !id
    || (bounds.minSort !== undefined && sort < bounds.minSort)
    || (bounds.maxSort !== undefined && sort > bounds.maxSort)) throw invalidCursor();
  return { sort, id };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function invalidCursor(): AppError { return new AppError("PAGE_CURSOR_INVALID", "Page cursor is invalid", 400); }

function parsePositiveInteger(value: string | null, fallback: number, errorCode: string): number {
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/u.test(value)) throw invalidNumberedPage(errorCode);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw invalidNumberedPage(errorCode);
  return parsed;
}

function invalidNumberedPage(errorCode: string): AppError {
  return new AppError(errorCode, "Page parameters are invalid", 400);
}
