import { requireCapability } from "../authorization/policy";
import { AppError, jsonResponse, methodNotAllowed, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import { decodeOpaqueCursor } from "../pagination";
import { deriveGraphCursorScopeKey } from "../graph/cursor";
import type { GraphProjectionService } from "../graph/service";
import { graphNodeMatchesRoot, parseGraphQuery, type GraphQuery } from "../graph/types";

export interface GraphRouteServices {
  graph: Pick<GraphProjectionService, "get">;
}

export async function routeGraphApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: GraphRouteServices,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/graph") return undefined;
  requireCapability(principal, "tasks:use");
  const member = requireMember(principal);
  if (request.method !== "GET") return methodNotAllowed("GET", context);

  const query = parseGraphQuery(url.searchParams);
  if (query.cursor !== null && query.cursor !== undefined) {
    await validateCursor(query.cursor, member.memberId, query);
  }

  const snapshot = await services.graph.get(member.memberId, query);
  if (query.rootId !== null && !snapshot.nodes.some((node) => graphNodeMatchesRoot(node.id, query.rootId!))) {
    throw new AppError("NOT_FOUND", "Not found", 404);
  }
  return jsonResponse(snapshot, 200, context.requestId);
}

async function validateCursor(cursor: string, memberId: string, query: GraphQuery): Promise<void> {
  let decoded: unknown;
  try {
    decoded = decodeOpaqueCursor(cursor);
  } catch {
    throw graphPageInvalid();
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw graphPageInvalid();
  const record = decoded as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(",") !== "kind,offset,scopeKey,v") throw graphPageInvalid();
  if (record.v !== 1 || record.kind !== "graph" || typeof record.scopeKey !== "string"
    || !Number.isSafeInteger(record.offset) || (record.offset as number) < 0) throw graphPageInvalid();
  // The same binding the service mints with, so a continuation is only accepted for
  // the member, scope, root, depth, types and range that produced it.
  if (record.scopeKey !== await deriveGraphCursorScopeKey(memberId, query)) throw graphPageInvalid();
}

function requireMember(principal: Principal): Extract<Principal, { kind: "member" }> {
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  return principal;
}

function graphPageInvalid(): AppError {
  return new AppError("GRAPH_PAGE_INVALID", "Graph cursor is invalid", 400);
}
