import type { MenuSnapshot } from "../../shared/admin-menu-fields";
import { requireCapability } from "../authorization/policy";
import { MenusRepository } from "../authorization/menus-repository";
import { APP_CONFIG } from "../config";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, readBoundedBodyBytes, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import { strictRecord } from "./member";

const MENU_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export interface AdminMenusRouteServices { menus: MenusRepository }

export async function routeAdminMenusApi(request: Request, url: URL, context: RequestContext, principal: Principal, services: AdminMenusRouteServices): Promise<Response | undefined> {
  if (url.pathname === "/api/admin/menus") {
    requireCapability(principal, "menu:manage");
    if (request.method === "GET") return jsonResponse(await services.menus.list(), 200, context.requestId);
    if (request.method !== "POST") return methodNotAllowed("GET, POST", context);
    if (principal.kind !== "member" || principal.role !== "admin") throw new AppError("FORBIDDEN", "Administrator access required", 403);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["key", "labelKey", "path", "parentId", "icon", "groupName", "position", "requiredBits"], "MENU_REQUEST_INVALID");
    if (typeof input.key !== "string" || typeof input.labelKey !== "string" || (input.path !== undefined && input.path !== null && typeof input.path !== "string") || (input.parentId !== undefined && input.parentId !== null && typeof input.parentId !== "string") || (input.icon !== undefined && input.icon !== null && typeof input.icon !== "string") || (input.groupName !== "workspace" && input.groupName !== "admin") || typeof input.position !== "number" || !Number.isSafeInteger(input.position) || input.position < 0 || typeof input.requiredBits !== "string") throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
    const menu = await services.menus.create({ key: input.key, labelKey: input.labelKey, path: input.path as string | null | undefined, parentId: input.parentId as string | null | undefined, icon: input.icon as string | null | undefined, groupName: input.groupName, position: input.position, requiredBits: input.requiredBits }, principal.memberId);
    // 201 for a fresh entry, 200 when the same creation intent replays its receipt.
    return jsonResponse({ menu: menu.menu, created: menu.created }, menu.created ? 201 : 200, context.requestId);
  }
  const match = /^\/api\/admin\/menus\/([^/]+)$/.exec(url.pathname);
  if (!match) return undefined;
  requireCapability(principal, "menu:manage");
  if (request.method !== "PATCH" && request.method !== "DELETE") return methodNotAllowed("PATCH, DELETE", context);
  if (principal.kind !== "member" || principal.role !== "admin") throw new AppError("FORBIDDEN", "Administrator access required", 403);
  if (request.method === "DELETE") {
    const removed = await services.menus.remove(decodePathId(match[1]!), principal.memberId, readExpectedDescendants(await readOptionalJsonBody(request)));
    return jsonResponse({ menu: removed }, 200, context.requestId);
  }
  const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["parentId", "labelKey", "path", "position", "requiredBits", "status", "visible", "expected"], "MENU_REQUEST_INVALID");
  if (input.parentId !== undefined && input.parentId !== null && typeof input.parentId !== "string") throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
  if (input.labelKey !== undefined && typeof input.labelKey !== "string") throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
  if (input.path !== undefined && input.path !== null && typeof input.path !== "string") throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
  if (input.position !== undefined && (typeof input.position !== "number" || !Number.isSafeInteger(input.position) || input.position < 0)) throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
  if (input.requiredBits !== undefined && typeof input.requiredBits !== "string") throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
  if (input.status !== undefined && input.status !== "active" && input.status !== "disabled") throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
  if (input.visible !== undefined && typeof input.visible !== "boolean") throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
  // `expected` stays optional on purpose. A deployed bundle in an already-open tab
  // still patches menus without a browser baseline, and rejecting it would turn a
  // working legacy write into a hard failure for no gain: the mutation statement
  // compares the whole server-read tree either way, so a lost race is refused with
  // MENU_WRITE_CONFLICT and a stale baseline can never overwrite the winner.
  let expected: MenuSnapshot | undefined;
  if (input.expected !== undefined) {
    const row = strictRecord(input.expected, ["parentId", "labelKey", "path", "position", "requiredBits", "status", "visible"], "MENU_REQUEST_INVALID");
    if ((row.parentId !== null && typeof row.parentId !== "string") || typeof row.labelKey !== "string" || (row.path !== null && typeof row.path !== "string") || typeof row.position !== "number" || !Number.isSafeInteger(row.position) || row.position < 0 || row.position > 10000 || typeof row.requiredBits !== "string" || !/^0x[0-9a-f]{1,16}$/iu.test(row.requiredBits) || (row.status !== "active" && row.status !== "disabled") || typeof row.visible !== "boolean") throw new AppError("MENU_REQUEST_INVALID", "Menu snapshot is invalid", 400);
    expected = row as unknown as MenuSnapshot;
  }
  const updateInput = {
    ...(expected ? { expected } : {}),
    ...(input.parentId === undefined ? {} : { parentId: input.parentId as string | null }),
    ...(input.labelKey === undefined ? {} : { labelKey: input.labelKey as string }),
    ...(input.path === undefined ? {} : { path: input.path as string | null }),
    ...(input.position === undefined ? {} : { position: input.position as number }),
    ...(input.requiredBits === undefined ? {} : { requiredBits: input.requiredBits as string }),
    ...(input.status === undefined ? {} : { status: input.status as "active" | "disabled" }),
    ...(input.visible === undefined ? {} : { visible: input.visible as boolean }),
  };
  const { menu } = await services.menus.update(decodePathId(match[1]!), updateInput, principal.memberId);
  return jsonResponse({ menu }, 200, context.requestId);
}

/** Deletes carry an optional acknowledgment body. An empty body keeps the plain leaf
 * deletion contract the admin page has always used, and a non-JSON body is refused
 * before it can be mistaken for "no acknowledged impact". */
async function readOptionalJsonBody(request: Request): Promise<unknown | undefined> {
  const bytes = await readBoundedBodyBytes(request, APP_CONFIG.maxJsonRequestBytes);
  if (bytes.byteLength === 0) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new AppError("INVALID_JSON", "Request body must be valid JSON", 400);
  }
}

/** The descendant ids the operator saw before confirming a parent deletion. */
function readExpectedDescendants(body: unknown): string[] | undefined {
  if (body === undefined) return undefined;
  const record = strictRecord(body, ["expectedDescendants"], "MENU_REQUEST_INVALID");
  const value = record.expectedDescendants;
  if (!Array.isArray(value) || value.length > 200) throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
  const ids: string[] = [];
  for (const id of value as unknown[]) {
    if (typeof id !== "string" || !MENU_ID_PATTERN.test(id)) throw new AppError("MENU_REQUEST_INVALID", "Menu request is invalid", 400);
    ids.push(id);
  }
  return ids;
}
