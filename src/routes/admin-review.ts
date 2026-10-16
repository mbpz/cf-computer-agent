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
import { trashRetention, type PublicationService, type ReviewDecisionOperationInput } from "../publication/service";
import type { BatchReviewResult, GovernedKnowledgeItem, PublishedRevision, ReviewPreview } from "../publication/types";
import type { ReviewCommentsService } from "../review-comments/service";
import { pageRequest, strictRecord, stringValue } from "./member";

export interface AdminReviewRouteServices {
  publication: PublicationService;
  reviewComments: ReviewCommentsService;
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
    || url.pathname.startsWith("/api/admin/submissions/")
    || url.pathname.startsWith("/api/admin/knowledge/");
  if (!reviewNamespace) return undefined;

  requireCapability(principal, "knowledge:review");

  // Dedicated versioned receipts: never fall back to the legacy POST on retry.
  const commentOperation = /^\/api\/admin\/submissions\/([^/]+)\/comments\/requests\/([^/]+)$/.exec(url.pathname);
  if (commentOperation) {
    const reviewer = requireAdminMember(principal);
    requireNoQuery(url);
    const submissionId = decodePathId(commentOperation[1]!);
    const operationId = decodePathId(commentOperation[2]!);
    const viewer = { memberId: reviewer.memberId, role: "admin" as const };
    if (request.method === "GET") {
      return jsonResponse({ operation: await services.reviewComments.findOperation(viewer, submissionId, operationId) }, 200, context.requestId);
    }
    if (request.method === "PUT") {
      const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["body"], "REVIEW_COMMENT_REQUEST_INVALID");
      return jsonResponse({ operation: await services.reviewComments.createOperation(viewer, submissionId, operationId, input.body) }, 200, context.requestId);
    }
    return methodNotAllowed("GET, PUT", context);
  }

  const adminComments = /^\/api\/admin\/submissions\/([^/]+)\/comments(?:\/([^/]+))?$/.exec(url.pathname);
  if (adminComments) {
    const reviewer = requireAdminMember(principal);
    requireNoQuery(url);
    const submissionId = decodePathId(adminComments[1]!);
    const commentId = adminComments[2] === undefined ? undefined : decodePathId(adminComments[2]);
    const viewer = { memberId: reviewer.memberId, role: "admin" as const };
    if (request.method === "GET" && commentId === undefined) {
      return jsonResponse({ comments: await services.reviewComments.list(viewer, submissionId) }, 200, context.requestId);
    }
    if (request.method === "POST" && commentId === undefined) {
      const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["body"], "REVIEW_COMMENT_REQUEST_INVALID");
      return jsonResponse({ comment: await services.reviewComments.create(viewer, submissionId, input.body) }, 201, context.requestId);
    }
    if (request.method === "PATCH" && commentId !== undefined) {
      const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["body"], "REVIEW_COMMENT_REQUEST_INVALID");
      return jsonResponse({ comment: await services.reviewComments.edit(viewer, commentId, input.body) }, 200, context.requestId);
    }
    return methodNotAllowed(commentId === undefined ? "GET, POST" : "PATCH", context);
  }

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

  if (url.pathname === "/api/admin/knowledge/trash") {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const reviewer = requireAdminMember(principal);
    const page = await services.publication.listTrashed(reviewerDto(reviewer), pageRequest(url));
    const now = new Date();
    return jsonResponse({
      items: page.items.map((item) => trashedKnowledgeDto(item, now)),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    }, 200, context.requestId);
  }

  if (url.pathname === "/api/admin/submissions/batch-review") {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const reviewer = requireAdminMember(principal);
    requireNoQuery(url);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["actions"],
      "BATCH_REVIEW_REQUEST_INVALID",
    );
    return jsonResponse(batchReviewDto(
      await services.publication.batchReview(reviewerDto(reviewer), input.actions),
    ), 200, context.requestId);
  }

  const trash = /^\/api\/admin\/knowledge\/([^/]+)\/trash$/.exec(url.pathname);
  if (trash) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const reviewer = requireAdminMember(principal);
    requireNoQuery(url);
    const input = await lifecycleRequestBody(request, ["operationId"]);
    const item = await services.publication.trash(
      reviewerDto(reviewer),
      decodePathId(trash[1]!),
      { operationId: input.operationId },
    );
    return jsonResponse({ knowledge: item }, 200, context.requestId);
  }

  const restore = /^\/api\/admin\/knowledge\/([^/]+)\/restore$/.exec(url.pathname);
  if (restore) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const reviewer = requireAdminMember(principal);
    requireNoQuery(url);
    const input = await lifecycleRequestBody(request, ["operationId"]);
    const item = await services.publication.restore(
      reviewerDto(reviewer),
      decodePathId(restore[1]!),
      { operationId: input.operationId },
    );
    return jsonResponse({ knowledge: item }, 200, context.requestId);
  }

  const purge = /^\/api\/admin\/knowledge\/([^/]+)\/purge$/.exec(url.pathname);
  if (purge) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const reviewer = requireAdminMember(principal);
    requireNoQuery(url);
    const knowledgeItemId = decodePathId(purge[1]!);
    const input = await lifecycleRequestBody(request, ["operationId", "confirm"]);
    requirePurgeConfirmation(input, knowledgeItemId);
    const result = await services.publication.purge(
      reviewerDto(reviewer),
      knowledgeItemId,
      new Date(),
      { operationId: input.operationId },
    );
    return jsonResponse({ purge: result }, 200, context.requestId);
  }

  const rollback = /^\/api\/admin\/knowledge\/([^/]+)\/rollback$/.exec(url.pathname);
  if (rollback) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const reviewer = requireAdminMember(principal);
    requireNoQuery(url);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["revisionId", "operationId"],
      "ROLLBACK_REQUEST_INVALID",
    );
    const revision = await services.publication.rollback(
      reviewerDto(reviewer),
      decodePathId(rollback[1]!),
      stringValue(input.revisionId),
      { operationId: input.operationId },
    );
    // The answer states both sides of the rollback: which revision is now
    // current, and which one it replaced.
    return jsonResponse({
      revision: publishedRevisionDto(revision),
      previousRevisionId: revision.previousRevisionId,
    }, 200, context.requestId);
  }

  const publish = /^\/api\/admin\/submissions\/([^/]+)\/publish$/.exec(url.pathname);
  if (publish) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const reviewer = requireAdminMember(principal);
    requireNoQuery(url);
    const submissionId = decodePathId(publish[1]!);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["title", "visibility", "spaceId", "collectionId", "tagIds", "knowledgeItemId", "visibilityReasonCode", "operationId", "expectedUpdatedAt"],
      "PUBLICATION_REQUEST_INVALID",
    );
    const revision = await services.publication.publish(reviewerDto(reviewer), submissionId, {
      title: stringValue(input.title),
      visibility: input.visibility as "shared" | "admin_only",
      spaceId: stringValue(input.spaceId),
      collectionId: nullableString(input.collectionId),
      tagIds: stringArray(input.tagIds),
      ...(input.knowledgeItemId === undefined ? {} : { knowledgeItemId: stringValue(input.knowledgeItemId) }),
      ...(input.visibilityReasonCode === undefined ? {} : {
        visibilityReasonCode: stringValue(input.visibilityReasonCode) as "admin_visibility_expansion",
      }),
    }, decisionOperationInput(input));
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
      ["reasonCode", "note", "operationId", "expectedUpdatedAt"],
      "REVIEW_REQUEST_INVALID",
    );
    const decision = await services.publication.reject(reviewerDto(reviewer), submissionId, {
      reasonCode: input.reasonCode as "not_relevant" | "duplicate" | "unsafe",
      note: stringValue(input.note),
    }, decisionOperationInput(input));
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
      ["reasonCode", "note", "operationId", "expectedUpdatedAt"],
      "REVIEW_REQUEST_INVALID",
    );
    const decision = await services.publication.requestRevision(reviewerDto(reviewer), submissionId, {
      reasonCode: input.reasonCode as "needs_revision",
      note: stringValue(input.note),
    }, decisionOperationInput(input));
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

/**
 * Reads a lifecycle body that may legitimately be absent: the operation number
 * is a client convenience, so a request without one keeps its natural-identity
 * behaviour instead of failing as malformed JSON. Any body that is present is
 * still exact.
 */
async function lifecycleRequestBody(request: Request, allowedKeys: readonly string[]): Promise<Record<string, unknown>> {
  if (request.body === null) return {};
  return strictRecord(
    await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
    allowedKeys,
    "KNOWLEDGE_LIFECYCLE_REQUEST_INVALID",
  );
}

/**
 * Purging destroys published content for good, so the request has to name the
 * exact item it destroys. A typed identifier can be re-read before the write;
 * a checkbox cannot.
 */
function requirePurgeConfirmation(body: Record<string, unknown>, knowledgeItemId: string): void {
  if (body.confirm !== knowledgeItemId) {
    throw new AppError(
      "KNOWLEDGE_PURGE_CONFIRMATION_REQUIRED",
      "Purging is irreversible and requires the knowledge item identifier as typed confirmation",
      400,
    );
  }
}

function reviewerDto(principal: Extract<Principal, { kind: "member" }>) {
  return { id: principal.memberId, role: principal.role, status: "active" as const };
}

function reviewPreviewDto(preview: ReviewPreview) {
  return {
    submissionId: preview.submissionId,
    submitterId: preview.submitterId,
    updatedAt: preview.updatedAt,
    status: preview.status,
    requestedSpaceId: preview.requestedSpaceId,
    requestedCollectionId: preview.requestedCollectionId,
    requestedVisibility: preview.requestedVisibility,
    requestedTarget: preview.requestedTarget === null ? null : {
      space: {
        id: preview.requestedTarget.space.id,
        slug: preview.requestedTarget.space.slug,
        name: preview.requestedTarget.space.name,
        status: preview.requestedTarget.space.status,
      },
      collection: preview.requestedTarget.collection === null ? null : {
        id: preview.requestedTarget.collection.id,
        name: preview.requestedTarget.collection.name,
        status: preview.requestedTarget.collection.status,
      },
      available: preview.requestedTarget.available,
    },
    kind: preview.kind,
    title: preview.title,
    rawContent: preview.rawContent,
    sourceVersion: {
      id: preview.sourceVersion.id,
      kind: preview.sourceVersion.kind,
      content: preview.sourceVersion.content,
      parserVersion: preview.sourceVersion.parserVersion,
    },
    safety: {
      status: preview.safety.status,
      findings: preview.safety.findings.map((finding) => ({ ...finding })),
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

/**
 * A trashed row plus the retained-window facts the purge path itself enforces
 * (the item's lifecycle timestamp is the exact anchor it compares against), so
 * the recycle bin states the real window instead of re-deriving the policy.
 */
function trashedKnowledgeDto(item: GovernedKnowledgeItem, now: Date) {
  return {
    id: item.id,
    spaceId: item.spaceId,
    collectionId: item.collectionId,
    revisionId: item.revisionId,
    title: item.title,
    visibility: item.visibility,
    status: item.status,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
    searchStatus: item.searchStatus,
    retention: trashRetention(item.updatedAt, now),
  };
}

function batchReviewDto(result: BatchReviewResult) {
  return {
    requested: result.requested,
    succeeded: result.succeeded,
    failed: result.failed,
    items: result.items.map((item) => item.status === "failed"
      ? { submissionId: item.submissionId, action: item.action, status: item.status, error: { ...item.error } }
      : {
        submissionId: item.submissionId,
        action: item.action,
        status: item.status,
        result: item.action === "publish"
          ? publishedRevisionDto(item.result as PublishedRevision)
          : item.result,
      }),
  };
}

function nullableString(value: unknown): string | null {
  return value === null ? null : stringValue(value);
}

/**
 * Reads the optional decision identity from a request body. Both fields are
 * validated by the service, which also hashes them into the operation.
 */
function decisionOperationInput(input: Record<string, unknown>): ReviewDecisionOperationInput | undefined {
  if (input.operationId === undefined && input.expectedUpdatedAt === undefined) return undefined;
  return { operationId: input.operationId, expectedUpdatedAt: input.expectedUpdatedAt };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue) : [];
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}
