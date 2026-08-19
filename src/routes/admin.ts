import type { AuditRepository } from "../audit/repository";
import { auditActions } from "../audit/types";
import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import { AppError, jsonResponse, methodNotAllowed, parseJsonRequest, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import type { MembersRepository } from "../members/repository";
import type { MembersService } from "../members/service";
import type { Member, MemberStatus } from "../members/types";
import { parsePageRequest } from "../pagination";
import { pageRequest, record, stringValue } from "./member";
import type { SpacesService } from "../spaces/service";
import type { SubmissionsService } from "../submissions/service";

export interface AdminRouteServices {
  audit: AuditRepository;
  members: MembersService;
  memberRecords: MembersRepository;
  spaces: SpacesService;
  submissions: SubmissionsService;
}

export async function routeAdminApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: AdminRouteServices,
): Promise<Response | undefined> {
  if (url.pathname === "/api/admin/submissions") {
    requireCapability(principal, "submission:read-all");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireEnumFilter(url, "status", ["review_pending"]);
    return jsonResponse(await services.submissions.listPending(pageRequest(url)), 200, context.requestId);
  }

  if (url.pathname === "/api/admin/members") {
    requireCapability(principal, "member:manage");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const status = requireEnumFilter(url, "status", ["active", "disabled"]);
    const page = pageRequest(url);
    const members = await services.memberRecords.listPage(page.limit, page.cursor, status);
    return jsonResponse({
      ...members,
      items: members.items.map(memberDto),
    }, 200, context.requestId);
  }

  const memberStatus = /^\/api\/admin\/members\/([^/]+)\/status$/.exec(url.pathname);
  if (memberStatus) {
    requireCapability(principal, "member:manage");
    if (request.method !== "PATCH") return methodNotAllowed("PATCH", context);
    const memberPrincipal = requireAdminMember(principal);
    const actor = await services.memberRecords.findById(memberPrincipal.memberId);
    if (!actor) throw new AppError("FORBIDDEN", "Administrator access required", 403);
    const input = record(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes));
    const status = input.status;
    if (status !== "active" && status !== "disabled") {
      throw new AppError("MEMBER_STATUS_INVALID", "Member status is invalid", 400);
    }
    const member = await services.members.setContributorStatus(actor, decodePathId(memberStatus[1]!), status);
    return jsonResponse({ member: memberDto(member) }, 200, context.requestId);
  }

  if (url.pathname === "/api/admin/spaces") {
    requireCapability(principal, "space:manage");
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const input = record(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes));
    const actor = requireAdminMember(principal);
    const space = await services.spaces.createSpace({
      slug: stringValue(input.slug),
      name: stringValue(input.name),
      description: optionalString(input.description),
      status: recordStatus(input.status),
      position: numberValue(input.position),
    }, actor.memberId);
    return jsonResponse({ space }, 201, context.requestId);
  }

  const space = /^\/api\/admin\/spaces\/([^/]+)$/.exec(url.pathname);
  if (space) {
    requireCapability(principal, "space:manage");
    if (request.method !== "PATCH") return methodNotAllowed("PATCH", context);
    const actor = requireAdminMember(principal);
    const input = record(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes));
    return jsonResponse({ space: await services.spaces.updateSpace(decodePathId(space[1]!), {
      ...(input.slug === undefined ? {} : { slug: stringValue(input.slug) }),
      ...(input.name === undefined ? {} : { name: stringValue(input.name) }),
      ...(input.description === undefined ? {} : { description: stringValue(input.description) }),
      ...(input.status === undefined ? {} : { status: recordStatus(input.status) }),
      ...(input.position === undefined ? {} : { position: numberValue(input.position) }),
    }, actor.memberId) }, 200, context.requestId);
  }

  if (url.pathname === "/api/admin/collections") {
    requireCapability(principal, "space:manage");
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const actor = requireAdminMember(principal);
    const input = record(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes));
    const collection = await services.spaces.createCollection({
      spaceId: stringValue(input.spaceId),
      parentId: optionalNullableString(input.parentId),
      name: stringValue(input.name),
      description: optionalString(input.description),
      status: recordStatus(input.status),
      position: numberValue(input.position),
    }, actor.memberId);
    return jsonResponse({ collection }, 201, context.requestId);
  }

  const collection = /^\/api\/admin\/collections\/([^/]+)$/.exec(url.pathname);
  if (collection) {
    requireCapability(principal, "space:manage");
    if (request.method !== "PATCH") return methodNotAllowed("PATCH", context);
    const actor = requireAdminMember(principal);
    const input = record(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes));
    return jsonResponse({ collection: await services.spaces.updateCollection(decodePathId(collection[1]!), {
      ...(input.parentId === undefined ? {} : { parentId: optionalNullableString(input.parentId) }),
      ...(input.name === undefined ? {} : { name: stringValue(input.name) }),
      ...(input.description === undefined ? {} : { description: stringValue(input.description) }),
      ...(input.status === undefined ? {} : { status: recordStatus(input.status) }),
      ...(input.position === undefined ? {} : { position: numberValue(input.position) }),
    }, actor.memberId) }, 200, context.requestId);
  }

  if (url.pathname === "/api/admin/audit-events") {
    requireCapability(principal, "audit:read");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const action = requireEnumFilter(url, "action", auditActions);
    return jsonResponse(await services.audit.listAudit(parsePageRequest(
      pageRequest(url).limit,
      pageRequest(url).cursor,
    ), action), 200, context.requestId);
  }

  return undefined;
}

function memberDto(member: Member): Omit<Member, "identitySubject"> {
  const { identitySubject: _identitySubject, ...safe } = member;
  return safe;
}

function requireAdminMember(principal: Principal): Extract<Principal, { kind: "member" }> {
  if (principal.kind !== "member" || principal.role !== "admin") {
    throw new AppError("FORBIDDEN", "Administrator access required", 403);
  }
  return principal;
}

function requireEnumFilter<T extends string>(url: URL, name: string, allowed: readonly T[]): T | undefined {
  const value = url.searchParams.get(name);
  if (value === null || value === "") return undefined;
  if (!allowed.includes(value as T)) throw new AppError("FILTER_INVALID", "Filter is invalid", 400);
  return value as T;
}

function recordStatus(value: unknown): "active" | "disabled" | undefined {
  return value === undefined ? undefined : value as "active" | "disabled";
}

function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : stringValue(value);
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  return stringValue(value);
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

function decodePathId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new AppError("NOT_FOUND", "Not found", 404);
  }
}
