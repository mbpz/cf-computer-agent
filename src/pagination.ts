import { AppError } from "./http";

export interface PageRequest {
  limit: number;
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export interface PageCursor {
  sort: number;
  id: string;
}

const defaultPageLimit = 20;
const maxPageLimit = 50;
const maxCursorLength = 512;

export function parsePageRequest(limit: number = defaultPageLimit, cursor?: string): PageRequest {
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1 || limit > maxPageLimit) {
    throw new AppError("PAGE_INVALID", "Page limit must be an integer from 1 to 50", 400);
  }
  return cursor === undefined ? { limit } : { limit, cursor };
}

export function encodePageCursor(cursor: PageCursor): string {
  return btoa(JSON.stringify({ v: 1, sort: cursor.sort, id: cursor.id }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodePageCursor(cursor: string): PageCursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.length > maxCursorLength || cursor.length % 4 === 1) throw new Error();
    const padded = cursor.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - cursor.length % 4) % 4);
    const decoded = JSON.parse(atob(padded)) as unknown;
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error();
    const { v, sort, id } = decoded as Record<string, unknown>;
    if (v !== 1 || typeof sort !== "number" || !Number.isInteger(sort) || typeof id !== "string" || !id) throw new Error();
    return { sort, id };
  } catch {
    throw new AppError("PAGE_CURSOR_INVALID", "Page cursor is invalid", 400);
  }
}
