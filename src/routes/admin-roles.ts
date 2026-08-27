import type { AuditRepository } from "../audit/repository";
import { requireCapability } from "../authorization/policy";
import { RolesRepository } from "../authorization/roles-repository";
import { APP_CONFIG } from "../config";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import { parsePermissionMask, serializePermissionMask } from "../authorization/permission-bitmap";
import { strictRecord } from "./member";

export interface AdminRolesRouteServices {
  roles: RolesRepository;
  audit: AuditRepository;
}

export async function routeAdminRolesApi(request: Request, url: URL, context: RequestContext, principal: Principal, services: AdminRolesRouteServices): Promise<Response | undefined> {
  if (url.pathname === "/api/admin/roles") {
    requireCapability(principal, "role:manage");
    if (request.method === "GET") return jsonResponse(await services.roles.list(), 200, context.requestId);
    if (request.method !== "POST") return methodNotAllowed("GET, POST", context);
    if (principal.kind !== "member" || principal.role !== "admin") throw new AppError("FORBIDDEN", "Administrator access required", 403);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["key", "name", "description", "allowBits"], "ROLE_REQUEST_INVALID");
    if (typeof input.key !== "string" || typeof input.name !== "string" || typeof input.allowBits !== "string" || (input.description !== undefined && typeof input.description !== "string")) throw new AppError("ROLE_REQUEST_INVALID", "Role request is invalid", 400);
    let allowBits: string;
    try { allowBits = serializePermissionMask(parsePermissionMask(input.allowBits)); } catch { throw new AppError("ROLE_REQUEST_INVALID", "Role permission mask is invalid", 400); }
    const role = await services.roles.create({ key: input.key, name: input.name, allowBits, ...(input.description === undefined ? {} : { description: input.description }) });
    await services.audit.writeAudit({ id: crypto.randomUUID(), actorKind: "member", actorId: principal.memberId, action: "role.created", resourceType: "role", resourceId: role.id, metadata: { allowBits: role.allowBits }, createdAt: new Date().toISOString() });
    return jsonResponse({ role }, 201, context.requestId);
  }
  const match = /^\/api\/admin\/roles\/([^/]+)$/.exec(url.pathname);
  if (!match) return undefined;
  requireCapability(principal, "role:manage");
  if (request.method !== "PATCH" && request.method !== "DELETE") return methodNotAllowed("PATCH, DELETE", context);
  if (principal.kind !== "member" || principal.role !== "admin") throw new AppError("FORBIDDEN", "Administrator access required", 403);
  if (request.method === "DELETE") {
    const removed = await services.roles.remove(decodePathId(match[1]!));
    await services.audit.writeAudit({ id: crypto.randomUUID(), actorKind: "member", actorId: principal.memberId, action: "role.deleted", resourceType: "role", resourceId: removed.id, metadata: { key: removed.key }, createdAt: new Date().toISOString() });
    return jsonResponse({ role: removed }, 200, context.requestId);
  }
  const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["name", "description", "allowBits"], "ROLE_REQUEST_INVALID");
  if (typeof input.allowBits !== "string") throw new AppError("ROLE_REQUEST_INVALID", "Role request is invalid", 400);
  let allowBits: string;
  try {
    allowBits = serializePermissionMask(parsePermissionMask(input.allowBits));
  } catch {
    throw new AppError("ROLE_REQUEST_INVALID", "Role permission mask is invalid", 400);
  }
  const previous = await services.roles.find(decodePathId(match[1]!));
  if (!previous) throw new AppError("ROLE_NOT_FOUND", "Role not found", 404);
  const updated = await services.roles.update(decodePathId(match[1]!), {
    allowBits,
    ...(input.name === undefined ? {} : { name: typeof input.name === "string" ? input.name : "" }),
    ...(input.description === undefined ? {} : { description: typeof input.description === "string" ? input.description : "" }),
  });
  await services.audit.writeAudit({
    id: crypto.randomUUID(),
    actorKind: "member",
    actorId: principal.memberId,
    action: "role.updated",
    resourceType: "role",
    resourceId: updated.id,
    metadata: { previousAllowBits: previous.allowBits, allowBits: updated.allowBits },
    createdAt: new Date().toISOString(),
  });
  return jsonResponse({ role: updated }, 200, context.requestId);
}
