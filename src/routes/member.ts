import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import { AppError, jsonResponse, methodNotAllowed, parseJsonRequest, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import { parsePageRequest, type PageRequest } from "../pagination";
import type { SpacesService } from "../spaces/service";
import type { SubmissionsService } from "../submissions/service";
import type { SubmissionKind } from "../submissions/types";

export interface MemberRouteServices {
  spaces: SpacesService;
  submissions: SubmissionsService;
}

export async function routeMemberApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: MemberRouteServices,
): Promise<Response | undefined> {
  if (url.pathname === "/api/spaces") {
    requireMember(principal);
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    return jsonResponse(await services.spaces.listSpaces(pageRequest(url)), 200, context.requestId);
  }

  const collections = /^\/api\/spaces\/([^/]+)\/collections$/.exec(url.pathname);
  if (collections) {
    requireMember(principal);
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    return jsonResponse(
      await services.spaces.listCollections(decodePathId(collections[1]!), pageRequest(url)),
      200,
      context.requestId,
    );
  }

  if (url.pathname === "/api/submissions") {
    requireCapability(principal, "submission:create");
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const member = requireMember(principal);
    const input = record(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes));
    const submission = await services.submissions.create(member.memberId, {
      requestedSpaceId: stringValue(input.requestedSpaceId),
      requestedCollectionId: optionalNullableString(input.requestedCollectionId),
      kind: input.kind as SubmissionKind,
      title: stringValue(input.title),
      content: stringValue(input.content),
    });
    return jsonResponse({ submission }, 201, context.requestId);
  }

  if (url.pathname === "/api/submissions/mine") {
    requireCapability(principal, "submission:read-own");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const member = requireMember(principal);
    return jsonResponse(await services.submissions.listOwn(member.memberId, pageRequest(url)), 200, context.requestId);
  }

  return undefined;
}

export function pageRequest(url: URL): PageRequest {
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor");
  return parsePageRequest(limit === null ? undefined : Number(limit), cursor === null ? undefined : cursor);
}

function requireMember(principal: Principal): Extract<Principal, { kind: "member" }> {
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  return principal;
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : Object.create(null) as Record<string, unknown>;
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  return stringValue(value);
}

function decodePathId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new AppError("NOT_FOUND", "Not found", 404);
  }
}
