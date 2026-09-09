import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import type { CalendarService } from "../calendar/service";
import type { CalendarEventStatus } from "../calendar/types";
import { strictRecord } from "./member";

export interface CalendarRouteServices { calendar: CalendarService; }

export async function routeCalendarApi(request: Request, url: URL, context: RequestContext, principal: Principal, services: CalendarRouteServices): Promise<Response | undefined> {
  if (!url.pathname.startsWith("/api/calendar")) return undefined;
  requireCapability(principal, "tasks:use");
  const member = requireMember(principal);
  if (url.pathname === "/api/calendar/events") {
    if (request.method === "GET") {
      const from = parseTime(url.searchParams.get("from"));
      const to = parseTime(url.searchParams.get("to"));
      const status = url.searchParams.get("status");
      if (status !== null && !["scheduled", "completed", "canceled"].includes(status)) throw new AppError("CALENDAR_INVALID", "Calendar status is invalid", 400);
      const pageKeys = ["from", "to", "status", "limit", "cursor"];
      requireExactQuery(url, pageKeys);
      return jsonResponse(await services.calendar.list(member.memberId, from, to, { limit: parseOptionalNumber(url.searchParams.get("limit")), cursor: url.searchParams.get("cursor") ?? undefined }, status as CalendarEventStatus | undefined), 200, context.requestId);
    }
    if (request.method !== "POST") return methodNotAllowed("GET, POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["id", "clientKey", "kind", "title", "description", "startsAt", "endsAt", "timezone", "allDay", "taskId", "projectId"], "CALENDAR_INVALID");
    const result = await services.calendar.create(member.memberId, input);
    return jsonResponse(result, result.created ? 201 : 200, context.requestId);
  }
  const event = /^\/api\/calendar\/events\/([^/]+)$/u.exec(url.pathname);
  if (event) {
    requireNoQuery(url);
    const id = decodePathId(event[1]!);
    if (request.method === "GET") return jsonResponse(await services.calendar.get(member.memberId, id), 200, context.requestId);
    if (request.method === "PATCH") {
      const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["title", "description", "startsAt", "endsAt", "timezone", "allDay", "taskId", "projectId"], "CALENDAR_INVALID");
      return jsonResponse(await services.calendar.update(member.memberId, id, input), 200, context.requestId);
    }
    if (request.method === "DELETE") return jsonResponse(await services.calendar.setStatus(member.memberId, id, "canceled"), 200, context.requestId);
    return methodNotAllowed("DELETE, GET, PATCH", context);
  }
  throw new AppError("NOT_FOUND", "Not found", 404);
}

function requireMember(principal: Principal): Extract<Principal, { kind: "member" }> { if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403); return principal; }
function requireExactQuery(url: URL, allowed: readonly string[]): void { for (const key of url.searchParams.keys()) if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) throw new AppError("CALENDAR_PAGE_INVALID", "Calendar query parameters are invalid", 400); }
function parseTime(value: string | null): number { if (!value) throw new AppError("CALENDAR_RANGE_INVALID", "Calendar range is required", 400); const result = Date.parse(value); if (!Number.isSafeInteger(result)) throw new AppError("CALENDAR_RANGE_INVALID", "Calendar range is invalid", 400); return result; }
function parseOptionalNumber(value: string | null): number | undefined { if (value === null) return undefined; const number = Number(value); if (!Number.isInteger(number)) throw new AppError("CALENDAR_PAGE_INVALID", "Calendar pagination is invalid", 400); return number; }
