import { APP_CONFIG } from "../config";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import type { NotificationsService } from "../notifications/service";
import { NOTIFICATION_EVENT_TYPES, type NotificationEventType, type NotificationListFilters } from "../notifications/types";
import { parseNumberedPageRequest } from "../pagination";
import { strictRecord } from "./member";

export interface NotificationsRouteServices { notifications: NotificationsService; }

export async function routeNotificationsApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: NotificationsRouteServices,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/notifications" && !url.pathname.startsWith("/api/notifications/")) return undefined;
  const member = requireMember(principal);

  if (url.pathname === "/api/notifications") {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    return jsonResponse(await services.notifications.list(
      member.memberId,
      notificationFilters(url),
      parseNumberedPageRequest(url, ["read", "type"], "NOTIFICATION_PAGE_INVALID"),
    ), 200, context.requestId);
  }

  if (url.pathname === "/api/notifications/summary") {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    return jsonResponse(await services.notifications.summary(member.memberId), 200, context.requestId);
  }

  if (url.pathname === "/api/notifications/read") {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["ids"],
      "NOTIFICATION_BULK_INVALID",
    );
    if (!Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > APP_CONFIG.maxNotificationBulkRead) {
      throw invalidBulk();
    }
    return jsonResponse(await services.notifications.markManyRead(member.memberId, {
      ids: input.ids,
      limit: Math.min(input.ids.length, APP_CONFIG.maxNotificationBulkRead),
    }), 200, context.requestId);
  }

  const read = /^\/api\/notifications\/([^/]+)\/read$/u.exec(url.pathname);
  if (read) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    if (request.body !== null) throw invalidRead();
    return jsonResponse(
      await services.notifications.markRead(member.memberId, decodePathId(read[1]!)),
      200,
      context.requestId,
    );
  }

  throw new AppError("NOT_FOUND", "Not found", 404);
}

function notificationFilters(url: URL): NotificationListFilters {
  const filters: NotificationListFilters = {};
  const read = url.searchParams.get("read");
  const eventType = url.searchParams.get("type");
  if (read !== null) {
    if (read !== "true" && read !== "false") throw invalidPage();
    filters.read = read === "true";
  }
  if (eventType !== null) {
    if (!NOTIFICATION_EVENT_TYPES.includes(eventType as NotificationEventType)) throw invalidPage();
    filters.eventType = eventType as NotificationEventType;
  }
  return filters;
}

function requireMember(principal: Principal): Extract<Principal, { kind: "member" }> {
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  return principal;
}

function invalidPage(): AppError {
  return new AppError("NOTIFICATION_PAGE_INVALID", "Notification query parameters are invalid", 400);
}

function invalidBulk(): AppError {
  return new AppError("NOTIFICATION_BULK_INVALID", "Notification bulk read is invalid", 400);
}

function invalidRead(): AppError {
  return new AppError("NOTIFICATION_READ_INVALID", "Notification read request is invalid", 400);
}
