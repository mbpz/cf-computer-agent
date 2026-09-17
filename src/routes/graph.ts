import { requireCapability } from "../authorization/policy";
import { AppError, jsonResponse, methodNotAllowed, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import { decodeOpaqueCursor, deriveCursorScopeKey } from "../pagination";
import type { GraphProjectionService } from "../graph/service";
import { graphNodeMatchesRoot, parseGraphQuery } from "../graph/types";

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
    await validateCursor(query.cursor, {
      memberId: member.memberId,
      scope: query.scope,
      rootId: query.rootId,
      depth: query.depth,
      types: query.types.join(","),
    });
  }

  const snapshot = await services.graph.get(member.memberId, query);
  if (query.rootId !== null && !snapshot.nodes.some((node) => graphNodeMatchesRoot(node.id, query.rootId!))) {
    throw new AppError("NOT_FOUND", "Not found", 404);
  }
  return jsonResponse(snapshot, 200, context.requestId);
}

async function validateCursor(cursor: string, scope: {
  memberId: string;
  scope: string;
  rootId: string | null;
  depth: number;
  types: string;
}): Promise<void> {
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
  const expected = await deriveCursorScopeKey("graph", scope);
  if (record.scopeKey !== expected) throw graphPageInvalid();
}

function requireMember(principal: Principal): Extract<Principal, { kind: "member" }> {
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  return principal;
}

function graphPageInvalid(): AppError {
  return new AppError("GRAPH_PAGE_INVALID", "Graph cursor is invalid", 400);
}
