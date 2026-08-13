import { AppError } from "./http";

export interface PageRequest { limit: number; cursor?: string; }
export interface Page<T> { items: T[]; nextCursor?: string; }
export interface PageCursor { sort: number; id: string; }

const defaultPageLimit = 20;
const maxPageLimit = 50;
const maxCursorLength = 512;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function parsePageRequest(limit: number = defaultPageLimit, cursor?: string): PageRequest {
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1 || limit > maxPageLimit) {
    throw new AppError("PAGE_INVALID", "Page limit must be an integer from 1 to 50", 400);
  }
  return cursor === undefined ? { limit } : { limit, cursor };
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

export function encodePageCursor(cursor: PageCursor): string { return encodeOpaqueCursor({ v: 1, sort: cursor.sort, id: cursor.id }); }

export function decodePageCursor(cursor: string): PageCursor {
  const decoded = decodeOpaqueCursor(cursor);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw invalidCursor();
  const { v, sort, id } = decoded as Record<string, unknown>;
  if (v !== 1 || typeof sort !== "number" || !Number.isInteger(sort) || typeof id !== "string" || !id) throw invalidCursor();
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

function invalidCursor(): AppError { return new AppError("PAGE_CURSOR_INVALID", "Page cursor is invalid", 400); }
