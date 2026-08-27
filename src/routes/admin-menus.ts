import type { AuditRepository } from "../audit/repository";
import { requireCapability } from "../authorization/policy";
import { MenusRepository } from "../authorization/menus-repository";
import { APP_CONFIG } from "../config";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import { strictRecord } from "./member";

export interface AdminMenusRouteServices { menus: MenusRepository; audit: AuditRepository }

export async function routeAdminMenusApi(request: Request, url: URL, context: RequestContext, principal: Principal, services: AdminMenusRouteServices): Promise<Response | undefined> {
  if (url.pathname === "/api/admin/menus") {
    requireCapability(principal, "menu:manage");
    if (request.method === "GET") return jsonResponse(await services.menus.list(), 200, context.requestId);
    if (request.method !== "POST") return methodNotAllowed("GET, POST", context);
    if (principal.kind !== "member" || principal.role !== "admin") throw new AppError("FORBIDDEN", "Administrator access required", 403);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["key", "labelKey", "path", "parentId", "icon", "groupName", "position", "requiredBits"], "MENU_REQUEST_INVALID");
    if (typeof input.key !== "string" || typeof input.labelKey !== "string" || (input.path !== undefined && input.path !== null && typeof input.path !== "string") || (input.parentId !== undefined && input.parentId !== null && typeof input.parentId !== "string") || (input.icon !== undefined && input.icon !== null && typeof input.icon !== "string") || (input.groupName !== "workspace" && input.groupName !== "admin") || typeof input.position !== "number" || !Number.isSafeInteger(input.position) || input.position < 0 || typeof input.requiredBits !== "string") throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
    const menu = await services.menus.create({ key: input.key, labelKey: input.labelKey, path: input.path as string | null | undefined, parentId: input.parentId as string | null | undefined, icon: input.icon as string | null | undefined, groupName: input.groupName, position: input.position, requiredBits: input.requiredBits });
    await services.audit.writeAudit({ id: crypto.randomUUID(), actorKind: "member", actorId: principal.memberId, action: "menu.updated", resourceType: "menu", resourceId: menu.id, metadata: { previousPath: null, path: menu.path, previousStatus: "disabled", status: menu.status, previousVisible: false, visible: menu.visible }, createdAt: new Date().toISOString() });
    return jsonResponse({ menu }, 201, context.requestId);
  }
  const match = /^\/api\/admin\/menus\/([^/]+)$/.exec(url.pathname);
  if (!match) return undefined;
  requireCapability(principal, "menu:manage");
  if (request.method !== "PATCH" && request.method !== "DELETE") return methodNotAllowed("PATCH, DELETE", context);
  if (principal.kind !== "member" || principal.role !== "admin") throw new AppError("FORBIDDEN", "Administrator access required", 403);
  if (request.method === "DELETE") {
    const removed = await services.menus.remove(decodePathId(match[1]!));
    await services.audit.writeAudit({ id: crypto.randomUUID(), actorKind: "member", actorId: principal.memberId, action: "menu.updated", resourceType: "menu", resourceId: removed.id, metadata: { previousPath: removed.path, path: null, previousStatus: removed.status, status: "disabled", previousVisible: removed.visible, visible: false }, createdAt: new Date().toISOString() });
    return jsonResponse({ menu: removed }, 200, context.requestId);
  }
  const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["parentId", "labelKey", "path", "position", "requiredBits", "status", "visible"], "MENU_REQUEST_INVALID");
  if (input.parentId !== undefined && input.parentId !== null && typeof input.parentId !== "string") throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
  if (input.labelKey !== undefined && typeof input.labelKey !== "string") throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
  if (input.path !== undefined && input.path !== null && typeof input.path !== "string") throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
  if (input.position !== undefined && (typeof input.position !== "number" || !Number.isSafeInteger(input.position) || input.position < 0)) throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
  if (input.requiredBits !== undefined && typeof input.requiredBits !== "string") throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
  if (input.status !== undefined && input.status !== "active" && input.status !== "disabled") throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
  if (input.visible !== undefined && typeof input.visible !== "boolean") throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
  const updateInput = {
    ...(input.parentId === undefined ? {} : { parentId: input.parentId as string | null }),
    ...(input.labelKey === undefined ? {} : { labelKey: input.labelKey as string }),
    ...(input.path === undefined ? {} : { path: input.path as string | null }),
    ...(input.position === undefined ? {} : { position: input.position as number }),
    ...(input.requiredBits === undefined ? {} : { requiredBits: input.requiredBits as string }),
    ...(input.status === undefined ? {} : { status: input.status as "active" | "disabled" }),
    ...(input.visible === undefined ? {} : { visible: input.visible as boolean }),
  };
  const { menu, previous } = await services.menus.update(decodePathId(match[1]!), updateInput);
  await services.audit.writeAudit({ id: crypto.randomUUID(), actorKind: "member", actorId: principal.memberId, action: "menu.updated", resourceType: "menu", resourceId: menu.id, metadata: { previousPath: previous.path, path: menu.path, previousStatus: previous.status, status: menu.status, previousVisible: previous.visible === true, visible: menu.visible === true }, createdAt: new Date().toISOString() });
  return jsonResponse({ menu }, 200, context.requestId);
}
