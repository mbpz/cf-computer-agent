import { requireCapability } from "../authorization/policy";
import { AppError, jsonResponse, methodNotAllowed, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import type { GraphSuggestionService } from "../graph/ai-suggestions";
import type { GraphProjectionService } from "../graph/service";
import { parseGraphQuery } from "../graph/types";

export interface GraphSuggestionRouteServices {
  graph: Pick<GraphProjectionService, "get">;
  suggestions: Pick<GraphSuggestionService, "suggest">;
}

export async function routeGraphSuggestionsApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: GraphSuggestionRouteServices,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/graph/suggestions") return undefined;
  requireCapability(principal, "tasks:use");
  const member = requireMember(principal);
  if (request.method !== "GET") return methodNotAllowed("GET", context);

  const query = parseGraphQuery(url.searchParams);
  if (query.cursor !== null && query.cursor !== undefined) throw new AppError("GRAPH_SUGGESTIONS_QUERY_INVALID", "Suggestions do not support cursor pagination", 400);
  const snapshot = await services.graph.get(member.memberId, { ...query, cursor: null });
  return jsonResponse(await services.suggestions.suggest(snapshot), 200, context.requestId);
}

function requireMember(principal: Principal): Extract<Principal, { kind: "member" }> {
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  return principal;
}
