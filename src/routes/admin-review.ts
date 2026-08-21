import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import {
  AppError,
  decodePathId,
  jsonResponse,
  methodNotAllowed,
  parseJsonRequest,
  requireNoQuery,
  type RequestContext,
} from "../http";
import type { Principal } from "../identity/principal";
import type { PublicationService } from "../publication/service";
import type { PublishedRevision, ReviewPreview } from "../publication/types";
import { strictRecord, stringValue } from "./member";

export interface AdminReviewRouteServices {
  publication: PublicationService;
}

export async function routeAdminReviewApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: AdminReviewRouteServices,
): Promise<Response | undefined> {
  const reviewNamespace = url.pathname === "/api/admin/publications/recover"
    || url.pathname.startsWith("/api/admin/publications/")
    || url.pathname.startsWith("/api/admin/submissions/");
  if (!reviewNamespace) return undefined;

  requireCapability(principal, "knowledge:review");

  if (url.pathname === "/api/admin/publications/recover") {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireAdminMember(principal);
    requireNoQuery(url);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["limit"],
      "RECOVERY_REQUEST_INVALID",
    );
    const limit = input.limit === undefined ? 20 : numberValue(input.limit);
    return jsonResponse(
      { recovery: await services.publication.recoverPending(limit) },
      200,
      context.requestId,
    );
  }

  const publish = /^\/api\/admin\/submissions\/([^/]+)\/publish$/.exec(url.pathname);
  if (publish) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const reviewer = requireAdminMember(principal);
    requireNoQuery(url);
    const submissionId = decodePathId(publish[1]!);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["title", "visibility", "spaceId", "collectionId", "tagIds"],
      "PUBLICATION_REQUEST_INVALID",
    );
    const revision = await services.publication.publish(reviewerDto(reviewer), submissionId, {
      title: stringValue(input.title),
      visibility: input.visibility as "shared" | "admin_only",
      spaceId: stringValue(input.spaceId),
      collectionId: nullableString(input.collectionId),
      tagIds: stringArray(input.tagIds),
    });
    return jsonResponse({ revision: publishedRevisionDto(revision) }, 200, context.requestId);
  }

  const reject = /^\/api\/admin\/submissions\/([^/]+)\/reject$/.exec(url.pathname);
  if (reject) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const reviewer = requireAdminMember(principal);
    requireNoQuery(url);
    const submissionId = decodePathId(reject[1]!);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["reasonCode", "note"],
      "REVIEW_REQUEST_INVALID",
    );
    const decision = await services.publication.reject(reviewerDto(reviewer), submissionId, {
      reasonCode: input.reasonCode as "not_relevant" | "duplicate" | "unsafe",
      note: stringValue(input.note),
    });
    return jsonResponse({ decision }, 200, context.requestId);
  }

  const requestRevision = /^\/api\/admin\/submissions\/([^/]+)\/request-revision$/.exec(url.pathname);
  if (requestRevision) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const reviewer = requireAdminMember(principal);
    requireNoQuery(url);
    const submissionId = decodePathId(requestRevision[1]!);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["reasonCode", "note"],
      "REVIEW_REQUEST_INVALID",
    );
    const decision = await services.publication.requestRevision(reviewerDto(reviewer), submissionId, {
      reasonCode: input.reasonCode as "needs_revision",
      note: stringValue(input.note),
    });
    return jsonResponse({ decision }, 200, context.requestId);
  }

  const detail = /^\/api\/admin\/submissions\/([^/]+)$/.exec(url.pathname);
  if (detail) {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const reviewer = requireAdminMember(principal);
    requireNoQuery(url);
    const preview = await services.publication.preview(
      reviewerDto(reviewer),
      decodePathId(detail[1]!),
    );
    return jsonResponse({ preview: reviewPreviewDto(preview) }, 200, context.requestId);
  }

  throw new AppError("NOT_FOUND", "Not found", 404);
}

function requireAdminMember(principal: Principal): Extract<Principal, { kind: "member" }> {
  if (principal.kind !== "member" || principal.role !== "admin") {
    throw new AppError("FORBIDDEN", "Administrator access required", 403);
  }
  return principal;
}

function reviewerDto(principal: Extract<Principal, { kind: "member" }>) {
  return { id: principal.memberId, role: principal.role, status: "active" as const };
}

function reviewPreviewDto(preview: ReviewPreview) {
  return {
    submissionId: preview.submissionId,
    submitterId: preview.submitterId,
    status: preview.status,
    requestedSpaceId: preview.requestedSpaceId,
    requestedCollectionId: preview.requestedCollectionId,
    kind: preview.kind,
    title: preview.title,
    rawContent: preview.rawContent,
    sourceVersion: {
      id: preview.sourceVersion.id,
      kind: preview.sourceVersion.kind,
      content: preview.sourceVersion.content,
      parserVersion: preview.sourceVersion.parserVersion,
    },
    chunks: preview.chunks.map((chunk) => ({
      headingPath: [...chunk.headingPath],
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      excerpt: chunk.excerpt,
    })),
  };
}

function publishedRevisionDto(revision: PublishedRevision) {
  const { normalizedPath: _normalizedPath, contentSha256: _contentSha256, ...safe } = revision;
  return safe;
}

function nullableString(value: unknown): string | null {
  return value === null ? null : stringValue(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue) : [];
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}
