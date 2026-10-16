import { decodeOpaqueCursor, deriveCursorScopeKey, encodeOpaqueCursor, type CursorScope } from "../pagination";
import type { GraphQuery } from "./types";

/**
 * The graph cursor binding. A continuation is only valid for the same member, scope,
 * root, depth, types and temporal range that produced it, so both the route that
 * validates a cursor and the service that mints the next one derive it here.
 */
export function graphCursorScope(memberId: string, query: GraphQuery): CursorScope {
  return {
    memberId,
    scope: query.scope,
    rootId: query.rootId,
    depth: query.depth,
    types: query.types.join(","),
    ...(query.from ? { from: query.from } : {}),
    ...(query.to ? { to: query.to } : {}),
    ...(query.changeKind ? { changeKind: query.changeKind } : {}),
  };
}

export function deriveGraphCursorScopeKey(memberId: string, query: GraphQuery): Promise<string> {
  return deriveCursorScopeKey("graph", graphCursorScope(memberId, query));
}

/**
 * The window offset a cursor carries. The route rejects a malformed or mismatched
 * cursor before the service reads it, so nothing unreadable counts as an offset.
 */
export function graphCursorOffset(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const decoded = decodeOpaqueCursor(cursor);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return 0;
    const offset = (decoded as Record<string, unknown>).offset;
    return typeof offset === "number" && Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
  } catch {
    return 0;
  }
}

/** The continuation token: the next window of the same query, bound to its scope key. */
export function encodeGraphCursor(scopeKey: string, offset: number): string {
  return encodeOpaqueCursor({ v: 1, kind: "graph", scopeKey, offset });
}
