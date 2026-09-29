import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import type { ConnectorAuthorizationsService } from "../environments/connector-authorizations";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";

export async function routeConnectorAuthorizationsApi(request: Request, url: URL, context: RequestContext,
  principal: Principal, services: { connectorAuthorizations: ConnectorAuthorizationsService }): Promise<Response | undefined> {
  const match = /^\/api\/environments\/([^/]+)\/(connector-authority(?:\/revoke)?|connector-tickets|connector-renewals)$/u.exec(url.pathname);
  if (!match) return undefined;
  const action = match[2];
  if (action !== "connector-authority/revoke") requireCapability(principal, "vm:use");
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  requireNoQuery(url);
  const id = decodePathId(match[1]!);
  const service = services.connectorAuthorizations;
  if (action === "connector-authority" && request.method === "GET") {
    return jsonResponse(await service.current(request, principal.memberId, id), 200, context.requestId);
  }
  if (request.method !== "POST") return methodNotAllowed(action === "connector-authority" ? "GET, POST" : "POST", context);
  const body = await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes);
  const result = action === "connector-authority" ? await service.reserve(request, principal.memberId, id, body)
    : action === "connector-tickets" ? await service.issue(request, principal.memberId, id, body)
      : action === "connector-renewals" ? await service.renew(request, principal.memberId, id, body)
      : await service.revoke(request, principal.memberId, id, body);
  return jsonResponse(result, action === "connector-authority/revoke" ? 200 : 201, context.requestId);
}


export async function routeConnectorConsumption(request: Request, url: URL, context: RequestContext,
  services: { connectorAuthorizations: ConnectorAuthorizationsService }): Promise<Response | undefined> {
  if (url.pathname !== "/api/connector/consume") return undefined;
  if (request.method !== "POST") return methodNotAllowed("POST", context);
  requireNoQuery(url);
  if (request.headers.has("origin") || request.headers.has("cookie") || request.headers.has("authorization")) {
    throw new AppError("FORBIDDEN", "Connector capability authentication required", 403);
  }
  const body = await parseJsonRequest(request, 12_288);
  return jsonResponse(await services.connectorAuthorizations.consume(body), 201, context.requestId);
}
