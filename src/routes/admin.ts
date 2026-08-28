import type { AuditRepository } from "../audit/repository";
import type { AssetDownloadVariant, AssetService } from "../assets/service";
import { auditActions } from "../audit/types";
import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import type { MembersRepository } from "../members/repository";
import type { MembersService } from "../members/service";
import type { Member, MemberStatus } from "../members/types";
import { parseNumberedPageRequest, parsePageRequest } from "../pagination";
import { pageRequest, record, strictRecord, stringValue } from "./member";
import type { SpacesService } from "../spaces/service";
import type { SubmissionsService } from "../submissions/service";
import type { TagsService } from "../tags/service";
import type { SourceReparseService } from "../sources/reparse-service";
import type { PublicationService } from "../publication/service";
import type { LibraryService } from "../library/service";
import type { AnalyticsRepository } from "../analytics/repository";
import type { DuplicateCandidatesService } from "../duplicates/service";

export interface AdminRouteServices {
  assets: AssetService;
  audit: AuditRepository;
  members: MembersService;
  memberRecords: MembersRepository;
  spaces: SpacesService;
  submissions: SubmissionsService;
  tags: TagsService;
  sourceReparse: SourceReparseService;
  publication: PublicationService;
  library: LibraryService;
  analytics: AnalyticsRepository;
  duplicates: DuplicateCandidatesService;
}

export async function routeAdminApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: AdminRouteServices,
): Promise<Response | undefined> {
  if (url.pathname === "/api/admin/analytics/overview") {
    requireCapability(principal, "audit:read");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const pagination = parseNumberedPageRequest(url, ["days"], "ANALYTICS_RANGE_INVALID");
    const days = parseAnalyticsDays(url);
    return jsonResponse(await services.analytics.overview(days, pagination), 200, context.requestId);
  }

  if (url.pathname === "/api/admin/duplicates") {
    requireCapability(principal, "submission:read-all");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    return jsonResponse(await services.duplicates.listPending(parseNumberedPageRequest(url, [])), 200, context.requestId);
  }

  const duplicateDecision = /^\/api\/admin\/duplicates\/([^/]+)\/decision$/.exec(url.pathname);
  if (duplicateDecision) {
    requireCapability(principal, "submission:read-all");
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const actor = requireAdminMember(principal);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["decision"], "DUPLICATE_REQUEST_INVALID");
    return jsonResponse({ candidate: await services.duplicates.decide(actor.memberId, decodePathId(duplicateDecision[1]!), input.decision) }, 200, context.requestId);
  }

  if (url.pathname === "/api/admin/assets/capacity") {
    requireCapability(principal, "submission:read-all");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    return jsonResponse(await services.assets.capacity(), 200, context.requestId);
  }

  if (url.pathname === "/api/admin/assets") {
    requireCapability(principal, "submission:read-all");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const pagination = parseNumberedPageRequest(url, ["status"]);
    const status = requireEnumFilter(url, "status", ["queued", "processing", "succeeded", "failed_retryable", "failed_terminal"] as const);
    return jsonResponse(await services.assets.listAdmin({
      ...pagination,
      ...(status === undefined ? {} : { status }),
    }), 200, context.requestId);
  }

  if (url.pathname === "/api/admin/assets/orphans") {
    requireCapability(principal, "submission:read-all");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const prefix = url.searchParams.get("prefix");
    if (prefix !== null && prefix !== "staging" && prefix !== "parsed") {
      throw new AppError("ASSET_ORPHAN_REQUEST_INVALID", "Orphan request is invalid", 400);
    }
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit === null ? undefined : Number(rawLimit);
    if (rawLimit !== null && (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 50)) {
      throw new AppError("ASSET_ORPHAN_REQUEST_INVALID", "Orphan request is invalid", 400);
    }
    return jsonResponse(await services.assets.previewOrphans({
      ...(prefix === null ? {} : { prefix: `${prefix}/` as "staging/" | "parsed/" }),
      ...(limit === undefined ? {} : { limit }),
    }), 200, context.requestId);
  }

  if (url.pathname === "/api/admin/assets/orphans/reclaim") {
    requireCapability(principal, "submission:read-all");
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["keys"],
      "ASSET_ORPHAN_REQUEST_INVALID",
    );
    if (!Array.isArray(input.keys) || input.keys.length > 50 || input.keys.some((key) => typeof key !== "string")) {
      throw new AppError("ASSET_ORPHAN_REQUEST_INVALID", "Orphan request is invalid", 400);
    }
    return jsonResponse(await services.assets.reclaimOrphans(input.keys as string[]), 200, context.requestId);
  }

  const assetPreview = /^\/api\/admin\/assets\/([^/]+)\/(parsed|original)$/.exec(url.pathname);
  const assetMetadataPreview = /^\/api\/admin\/assets\/([^/]+)\/preview$/.exec(url.pathname);
  if (assetMetadataPreview) {
    requireCapability(principal, "submission:read-all");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    return jsonResponse(await services.assets.previewAdmin(decodePathId(assetMetadataPreview[1]!)), 200, context.requestId);
  }
  if (assetPreview) {
    requireCapability(principal, "submission:read-all");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    const result = await services.assets.downloadAdmin(
      decodePathId(assetPreview[1]!),
      assetPreview[2] as AssetDownloadVariant,
    );
    return new Response(result.body, {
      status: 200,
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `inline; filename="${result.filename.replace(/["\\\r\n]/gu, "_")}"`,
        "content-type": result.contentType,
        "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "x-request-id": context.requestId,
      },
    });
  }

  const assetRetry = /^\/api\/admin\/assets\/([^/]+)\/retry$/.exec(url.pathname);
  if (assetRetry) {
    requireCapability(principal, "submission:read-all");
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    return jsonResponse(await services.assets.retry(decodePathId(assetRetry[1]!)), 200, context.requestId);
  }

  if (url.pathname === "/api/admin/submissions") {
    requireCapability(principal, "submission:read-all");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const pagination = parseNumberedPageRequest(url, ["status"]);
    requireEnumFilter(url, "status", ["review_pending"]);
    return jsonResponse(await services.submissions.listPending(pagination), 200, context.requestId);
  }

  const chunkPreview = /^\/api\/admin\/knowledge\/([^/]+)\/revisions\/([^/]+)\/chunks$/.exec(url.pathname);
  const chunkRebuildReport = /^\/api\/admin\/knowledge\/([^/]+)\/revisions\/([^/]+)\/chunks\/rebuild-report$/.exec(url.pathname);
  const chunkStatus = /^\/api\/admin\/knowledge\/([^/]+)\/revisions\/([^/]+)\/chunks\/([^/]+)\/status$/.exec(url.pathname);
  if (chunkRebuildReport) {
    requireCapability(principal, "knowledge:review");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    const member = requireAdminMember(principal);
    return jsonResponse(await services.publication.rebuildChunkReport(
      { id: member.memberId, role: member.role, status: "active" },
      decodePathId(chunkRebuildReport[2]!),
    ), 200, context.requestId);
  }
  if (chunkStatus) {
    requireCapability(principal, "knowledge:review");
    if (request.method !== "PATCH") return methodNotAllowed("PATCH", context);
    const member = requireAdminMember(principal);
    requireNoQuery(url);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["status"],
      "CHUNK_STATUS_INVALID",
    );
    if (input.status !== "active" && input.status !== "disabled") {
      throw new AppError("CHUNK_STATUS_INVALID", "Chunk status is invalid", 400);
    }
    const chunk = await services.library.setChunkStatus(
      { memberId: member.memberId, role: member.role },
      decodePathId(chunkStatus[1]!),
      decodePathId(chunkStatus[2]!),
      decodePathId(chunkStatus[3]!),
      input.status,
    );
    return jsonResponse({ chunk }, 200, context.requestId);
  }
  if (chunkPreview) {
    requireCapability(principal, "knowledge:review");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requirePageQuery(url);
    const member = requireAdminMember(principal);
    return jsonResponse(await services.library.previewChunks(
      { memberId: member.memberId, role: member.role },
      decodePathId(chunkPreview[1]!),
      decodePathId(chunkPreview[2]!),
      pageRequest(url),
    ), 200, context.requestId);
  }

  if (url.pathname === "/api/admin/tags") {
    requireCapability(principal, "space:manage");
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireAdminMember(principal);
    requireNoQuery(url);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["spaceId", "slug", "name"],
      "TAG_REQUEST_INVALID",
    );
    const tag = await services.tags.create({
      spaceId: stringValue(input.spaceId),
      slug: stringValue(input.slug),
      name: stringValue(input.name),
    });
    return jsonResponse({ tag }, 201, context.requestId);
  }

  if (url.pathname === "/api/admin/members") {
    requireCapability(principal, "member:manage");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const page = parseNumberedPageRequest(url, ["status"]);
    const status = requireEnumFilter(url, "status", ["active", "disabled"]);
    const members = await services.memberRecords.listPage(page, status);
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
    if (request.method === "GET") return jsonResponse(await services.spaces.listSpaces(pageRequest(url)), 200, context.requestId);
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

  const spaceCollections = /^\/api\/admin\/spaces\/([^/]+)\/collections$/.exec(url.pathname);
  if (spaceCollections) {
    requireCapability(principal, "space:manage");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    return jsonResponse(await services.spaces.listCollections(decodePathId(spaceCollections[1]!), pageRequest(url)), 200, context.requestId);
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
    const page = parseNumberedPageRequest(url, ["action"]);
    const action = requireEnumFilter(url, "action", auditActions);
    return jsonResponse(await services.audit.listAudit(page, action), 200, context.requestId);
  }

  const reparseSource = /^\/api\/admin\/source-versions\/([^/]+)\/reparse$/.exec(url.pathname);
  if (reparseSource) {
    requireCapability(principal, "knowledge:review");
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const actor = requireAdminMember(principal);
    requireNoQuery(url);
    const queued = await services.sourceReparse.create(actor.memberId, decodePathId(reparseSource[1]!));
    const job = await services.sourceReparse.process(queued.id);
    return jsonResponse({ job }, job.status === "indexed" || job.status === "failed_terminal" ? 200 : 202, context.requestId);
  }

  const reparseCorrection = /^\/api\/admin\/reparse-jobs\/([^/]+)\/candidate$/.exec(url.pathname);
  if (reparseCorrection) {
    requireCapability(principal, "knowledge:review");
    if (request.method !== "PATCH") return methodNotAllowed("PATCH", context);
    const actor = requireAdminMember(principal);
    requireNoQuery(url);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["normalizedMarkdown"],
      "SOURCE_REPARSE_INVALID",
    );
    if (typeof input.normalizedMarkdown !== "string") {
      throw new AppError("SOURCE_REPARSE_INVALID", "Source reparse input is invalid", 400);
    }
    const job = await services.sourceReparse.correct(
      decodePathId(reparseCorrection[1]!),
      actor.memberId,
      input.normalizedMarkdown,
    );
    return jsonResponse({ job }, 200, context.requestId);
  }

  const reparseJob = /^\/api\/admin\/reparse-jobs\/([^/]+)$/.exec(url.pathname);
  const reparsePublish = /^\/api\/admin\/reparse-jobs\/([^/]+)\/publish$/.exec(url.pathname);
  if (reparsePublish) {
    requireCapability(principal, "knowledge:review");
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const actor = requireAdminMember(principal);
    requireNoQuery(url);
    const reviewer = { id: actor.memberId, role: actor.role, status: "active" as const };
    const jobId = decodePathId(reparsePublish[1]!);
    const promotion = await services.sourceReparse.promote(jobId, actor.memberId);
    const snapshot = await services.sourceReparse.snapshot(jobId);
    const preview = await services.publication.preview(reviewer, promotion.submissionId);
    const revision = await services.publication.publish(reviewer, promotion.submissionId, {
      title: preview.title,
      visibility: preview.requestedVisibility,
      spaceId: preview.requestedSpaceId,
      collectionId: preview.requestedCollectionId,
      tagIds: [],
      ...(snapshot.publishedKnowledgeItemId === null ? {} : { knowledgeItemId: snapshot.publishedKnowledgeItemId }),
    });
    return jsonResponse({ promotion, revision }, 200, context.requestId);
  }
  const reparsePromotion = /^\/api\/admin\/reparse-jobs\/([^/]+)\/promote$/.exec(url.pathname);
  if (reparsePromotion) {
    requireCapability(principal, "knowledge:review");
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const actor = requireAdminMember(principal);
    requireNoQuery(url);
    const promotion = await services.sourceReparse.promote(decodePathId(reparsePromotion[1]!), actor.memberId);
    return jsonResponse({ promotion }, 201, context.requestId);
  }
  if (reparseJob) {
    requireCapability(principal, "knowledge:review");
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireAdminMember(principal);
    requireNoQuery(url);
    const job = await services.sourceReparse.get(decodePathId(reparseJob[1]!));
    return jsonResponse({ job }, 200, context.requestId);
  }

  return undefined;
}

function parseAnalyticsDays(url: URL): number {
  const raw = url.searchParams.get("days");
  if (raw === null) return 7;
  const days = Number(raw);
  if (!Number.isSafeInteger(days) || days < 1 || days > 31) throw new AppError("ANALYTICS_RANGE_INVALID", "Analytics range must be between 1 and 31 days", 400);
  return days;
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

function requirePageQuery(url: URL): void {
  for (const key of url.searchParams.keys()) {
    if (key !== "limit" && key !== "cursor") {
      throw new AppError("PAGE_INVALID", "Pagination parameters are invalid", 400);
    }
    if (url.searchParams.getAll(key).length !== 1) {
      throw new AppError("PAGE_INVALID", "Pagination parameters are invalid", 400);
    }
  }
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
