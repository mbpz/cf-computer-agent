import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import { parsePageRequest, type PageRequest } from "../pagination";
import type { SpacesService } from "../spaces/service";
import type { SubmissionsService } from "../submissions/service";
import type { SubmissionKind } from "../submissions/types";
import type { TagsService } from "../tags/service";

export interface MemberRouteServices {
  spaces: SpacesService;
  submissions: SubmissionsService;
  tags: TagsService;
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

  const tags = /^\/api\/spaces\/([^/]+)\/tags$/.exec(url.pathname);
  if (tags) {
    requireCapability(principal, "knowledge:read");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireMember(principal);
    requireExactQuery(url, ["limit", "cursor"]);
    const page = await services.tags.listActivePage(decodePathId(tags[1]!), pageRequest(url));
    return jsonResponse(
      { tags: page.items, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) },
      200,
      context.requestId,
    );
  }

  if (url.pathname === "/api/submissions") {
    requireCapability(principal, "submission:create");
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const member = requireMember(principal);
    requireNoQuery(url);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["requestedSpaceId", "requestedCollectionId", "kind", "title", "content", "contentBase64", "language", "fileLabel", "lineBaseline"],
      "SUBMISSION_REQUEST_INVALID",
    );
    const hasContent = Object.hasOwn(input, "content");
    const hasContentBase64 = Object.hasOwn(input, "contentBase64");
    if (hasContent === hasContentBase64) {
      throw new AppError("SUBMISSION_REQUEST_INVALID", "Request body is invalid", 400);
    }
    const result = await services.submissions.createWithSourceVersion(member.memberId, {
      requestedSpaceId: stringValue(input.requestedSpaceId),
      requestedCollectionId: optionalNullableString(input.requestedCollectionId),
      kind: input.kind as SubmissionKind,
      title: stringValue(input.title),
      ...(hasContent ? { content: stringValue(input.content) } : { contentBase64: stringValue(input.contentBase64) }),
      idempotencyKey: request.headers.get("idempotency-key") || "",
      ...(input.language === undefined ? {} : { language: stringValue(input.language) }),
      ...(input.fileLabel === undefined ? {} : { fileLabel: stringValue(input.fileLabel) }),
      ...(input.lineBaseline === undefined ? {} : { lineBaseline: input.lineBaseline as number }),
    });
    return jsonResponse({
      submission: result.submission,
      duplicateCandidate: result.duplicateCandidate,
    }, result.submission ? 201 : 200, context.requestId);
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

export function strictRecord(
  value: unknown,
  allowedKeys: readonly string[],
  code: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError(code, "Request body is invalid", 400);
  }
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !allowedKeys.includes(key))) {
    throw new AppError(code, "Request body is invalid", 400);
  }
  return result;
}

function requireExactQuery(url: URL, allowedKeys: readonly string[]): void {
  for (const key of url.searchParams.keys()) {
    if (!allowedKeys.includes(key) || url.searchParams.getAll(key).length !== 1) {
      throw new AppError("PAGE_INVALID", "Pagination parameters are invalid", 400);
    }
  }
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  return stringValue(value);
}
