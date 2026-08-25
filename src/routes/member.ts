import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, readBoundedBodyBytes, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import type { AssetService } from "../assets/service";
import { parsePageRequest, type PageRequest } from "../pagination";
import type { SpacesService } from "../spaces/service";
import type { SubmissionsService } from "../submissions/service";
import type { SubmissionKind, SubmissionPageRequest, SubmissionStatusFilter } from "../submissions/types";
import type { TagsService } from "../tags/service";

export interface MemberRouteServices {
  assets: AssetService;
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
  if (url.pathname === "/api/assets") {
    const member = requireMember(principal);
    if (request.method === "GET") {
      requireCapability(principal, "submission:read-own");
      requireExactQuery(url, ["limit", "cursor"]);
      return jsonResponse(await services.assets.listOwned(member.memberId, pageRequest(url)), 200, context.requestId);
    }
    requireCapability(principal, "submission:create");
    if (request.method !== "POST") return methodNotAllowed("GET, POST", context);
    requireNoQuery(url);
    // Keep the free-tier text-only deployment from buffering a binary body
    // before reporting that paid object storage is unavailable.
    services.assets.assertStorageEnabled();
    const idempotencyKey = request.headers.get("idempotency-key") || "";
    const originalName = request.headers.get("x-asset-name") || "";
    const contentType = request.headers.get("content-type") || "";
    const bytes = await readBoundedBodyBytes(request, APP_CONFIG.maxAssetBytes, "ASSET_TOO_LARGE", "Asset exceeds the upload limit");
    const result = await services.assets.create({
      ownerId: member.memberId,
      originalName,
      contentType,
      bytes: bytes.slice().buffer,
      idempotencyKey,
    });
    return jsonResponse(result, 201, context.requestId);
  }

  const asset = /^\/api\/assets\/([^/]+)$/.exec(url.pathname);
  const assetPreview = /^\/api\/assets\/([^/]+)\/preview$/.exec(url.pathname);
  const assetDownload = /^\/api\/assets\/([^/]+)\/(original|parsed)$/.exec(url.pathname);
  if (assetPreview) {
    requireCapability(principal, "submission:read-own");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const member = requireMember(principal);
    requireNoQuery(url);
    return jsonResponse(await services.assets.preview(member.memberId, decodePathId(assetPreview[1]!)), 200, context.requestId);
  }
  if (assetDownload) {
    requireCapability(principal, "submission:read-own");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const member = requireMember(principal);
    requireNoQuery(url);
    const result = await services.assets.download(
      member.memberId,
      decodePathId(assetDownload[1]!),
      assetDownload[2] as "original" | "parsed",
    );
    return assetDownloadResponse(result, context.requestId);
  }
  if (asset) {
    requireCapability(principal, "submission:read-own");
    const member = requireMember(principal);
    requireNoQuery(url);
    if (request.method === "POST") {
      requireCapability(principal, "submission:create");
      return jsonResponse(await services.assets.process(member.memberId, decodePathId(asset[1]!)), 200, context.requestId);
    }
    if (request.method !== "GET") return methodNotAllowed("GET, POST", context);
    return jsonResponse(await services.assets.getOwned(member.memberId, decodePathId(asset[1]!)), 200, context.requestId);
  }

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
      ["requestedSpaceId", "requestedCollectionId", "requestedVisibility", "kind", "title", "content", "contentBase64", "contentFormat", "language", "fileLabel", "lineBaseline"],
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
      ...(input.requestedVisibility === undefined ? {} : {
        requestedVisibility: input.requestedVisibility as "shared" | "admin_only",
      }),
      kind: input.kind as SubmissionKind,
      title: stringValue(input.title),
      ...(hasContent ? { content: stringValue(input.content) } : { contentBase64: stringValue(input.contentBase64) }),
      ...(input.contentFormat === undefined ? {} : { contentFormat: input.contentFormat as "plain" | "rich_text" }),
      idempotencyKey: request.headers.get("idempotency-key") || "",
      ...(input.language === undefined ? {} : { language: stringValue(input.language) }),
      ...(input.fileLabel === undefined ? {} : { fileLabel: stringValue(input.fileLabel) }),
      ...(input.lineBaseline === undefined ? {} : { lineBaseline: input.lineBaseline as number }),
    });
    return jsonResponse({
      submission: result.submission,
      duplicateCandidate: result.duplicateCandidate,
    }, result.submission?.status === "rejected" ? 200 : 201, context.requestId);
  }

  if (url.pathname === "/api/submissions/drafts") {
    requireCapability(principal, "submission:create");
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const member = requireMember(principal);
    requireNoQuery(url);
    const input = draftInput(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes));
    return jsonResponse(await services.submissions.createDraft(member.memberId, input), 201, context.requestId);
  }

  const draft = /^\/api\/submissions\/drafts\/([^/]+)$/.exec(url.pathname);
  if (draft) {
    requireCapability(principal, "submission:read-own");
    const member = requireMember(principal);
    requireNoQuery(url);
    const draftId = decodePathId(draft[1]!);
    if (request.method === "GET") {
      return jsonResponse(await services.submissions.getDraft(member.memberId, draftId), 200, context.requestId);
    }
    if (request.method === "PATCH") {
      requireCapability(principal, "submission:create");
      return jsonResponse(
        await services.submissions.updateDraft(member.memberId, draftId, draftInput(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes))),
        200,
        context.requestId,
      );
    }
    return methodNotAllowed("GET, PATCH", context);
  }

  const resubmit = /^\/api\/submissions\/([^/]+)\/resubmit$/.exec(url.pathname);
  if (resubmit) {
    requireCapability(principal, "submission:create");
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const member = requireMember(principal);
    const priorSubmissionId = decodePathId(resubmit[1]!);
    await services.submissions.assertResubmittable(member.memberId, priorSubmissionId);
    requireNoQuery(url);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["requestedSpaceId", "requestedCollectionId", "requestedVisibility", "kind", "title", "content", "contentBase64", "contentFormat", "language", "fileLabel", "lineBaseline"],
      "SUBMISSION_REQUEST_INVALID",
    );
    const hasContent = Object.hasOwn(input, "content");
    const hasContentBase64 = Object.hasOwn(input, "contentBase64");
    if (hasContent === hasContentBase64) {
      throw new AppError("SUBMISSION_REQUEST_INVALID", "Request body is invalid", 400);
    }
    const result = await services.submissions.resubmit(member.memberId, priorSubmissionId, {
      ...(input.requestedSpaceId === undefined ? {} : { requestedSpaceId: stringValue(input.requestedSpaceId) }),
      ...(input.requestedCollectionId === undefined ? {} : { requestedCollectionId: optionalNullableString(input.requestedCollectionId) }),
      ...(input.requestedVisibility === undefined ? {} : {
        requestedVisibility: input.requestedVisibility as "shared" | "admin_only",
      }),
      kind: input.kind as SubmissionKind,
      title: stringValue(input.title),
      ...(hasContent ? { content: stringValue(input.content) } : { contentBase64: stringValue(input.contentBase64) }),
      ...(input.contentFormat === undefined ? {} : { contentFormat: input.contentFormat as "plain" | "rich_text" }),
      ...(input.language === undefined ? {} : { language: stringValue(input.language) }),
      ...(input.fileLabel === undefined ? {} : { fileLabel: stringValue(input.fileLabel) }),
      ...(input.lineBaseline === undefined ? {} : { lineBaseline: input.lineBaseline as number }),
    }, request.headers.get("idempotency-key") || "");
    return jsonResponse({
      submission: result.submission,
      duplicateCandidate: result.duplicateCandidate,
    }, 201, context.requestId);
  }

  if (url.pathname === "/api/submissions/mine") {
    requireCapability(principal, "submission:read-own");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const member = requireMember(principal);
    requireExactQuery(url, ["limit", "cursor", "status"]);
    const status = url.searchParams.get("status");
    return jsonResponse(await services.submissions.listOwn(member.memberId, {
      ...pageRequest(url),
      ...(status === null ? {} : { status: status as SubmissionStatusFilter }),
    }), 200, context.requestId);
  }

  return undefined;
}

function assetDownloadResponse(
  result: { body: ArrayBuffer; contentType: string; filename: string },
  requestId: string,
): Response {
  const encoded = encodeURIComponent(result.filename);
  const ascii = result.filename.replace(/[^\x20-\x7e]/gu, "_").replace(/["\\]/gu, "_") || "asset";
  return new Response(result.body, {
    status: 200,
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`,
      "content-type": result.contentType,
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-request-id": requestId,
    },
  });
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

function draftInput(value: unknown): {
  requestedSpaceId: string;
  requestedCollectionId?: string | null;
  requestedVisibility?: "shared" | "admin_only";
  kind: SubmissionKind;
  title: string;
  content: string;
} {
  const input = strictRecord(
    value,
    ["requestedSpaceId", "requestedCollectionId", "requestedVisibility", "kind", "title", "content"],
    "SUBMISSION_REQUEST_INVALID",
  );
  if (typeof input.requestedSpaceId !== "string" || typeof input.kind !== "string"
    || typeof input.title !== "string" || typeof input.content !== "string") {
    throw new AppError("SUBMISSION_REQUEST_INVALID", "Request body is invalid", 400);
  }
  return {
    requestedSpaceId: input.requestedSpaceId,
    requestedCollectionId: optionalNullableString(input.requestedCollectionId),
    ...(input.requestedVisibility === undefined ? {} : { requestedVisibility: input.requestedVisibility as "shared" | "admin_only" }),
    kind: input.kind as SubmissionKind,
    title: input.title,
    content: input.content,
  };
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
