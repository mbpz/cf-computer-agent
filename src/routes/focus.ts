import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import type { FocusService } from "../focus/service";
import { strictRecord } from "./member";

export async function routeFocusApi(request: Request, url: URL, context: RequestContext, principal: Principal, services: { focus: FocusService }): Promise<Response | undefined> {
  if (!url.pathname.startsWith("/api/focus")) return undefined;
  requireCapability(principal, "tasks:use");
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  if (url.pathname === "/api/focus/current") {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    return jsonResponse({ session: await services.focus.current(principal.memberId) }, 200, context.requestId);
  }
  if (url.pathname === "/api/focus") {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["id", "clientKey", "taskId", "title", "durationMinutes"], "FOCUS_INVALID");
    const result = await services.focus.start(principal.memberId, input);
    return jsonResponse(result, result.created ? 201 : 200, context.requestId);
  }
  const action = /^\/api\/focus\/([^/]+)\/(pause|resume|complete|abandon)$/u.exec(url.pathname);
  if (action) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const id = decodePathId(action[1]!);
    const session = action[2] === "pause" ? await services.focus.pause(principal.memberId, id)
      : action[2] === "resume" ? await services.focus.resume(principal.memberId, id)
        : action[2] === "complete" ? await services.focus.complete(principal.memberId, id)
          : await services.focus.abandon(principal.memberId, id);
    return jsonResponse(session, 200, context.requestId);
  }
  throw new AppError("NOT_FOUND", "Not found", 404);
}
