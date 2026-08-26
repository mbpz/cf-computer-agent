import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import {
  AppError,
  decodePathId,
  jsonResponse,
  methodNotAllowed,
  parseJsonRequest,
  type RequestContext,
} from "../http";
import type { Principal } from "../identity/principal";
import type { LibraryService } from "../library/service";
import type { ChatScope, LibraryScope, SearchRequest } from "../library/types";
import type { CitedAnswerService } from "../ai/cited-answer-service";
import type { SourceSummaryService } from "../ai/source-summary-service";
import type { FaqService } from "../ai/faq-service";
import type { TimelineService } from "../ai/timeline-service";
import type { BriefService } from "../ai/brief-service";
import type { ComparisonService } from "../ai/comparison-service";
import type { ResearchReportService } from "../ai/research-report-service";
import type { PrivateNotesService } from "../private-notes/service";
import { strictRecord, stringValue } from "./member";

export interface LibraryRouteServices {
  citedAnswers: CitedAnswerService;
  sourceSummaries: SourceSummaryService;
  faqs: FaqService;
  timelines: TimelineService;
  briefs: BriefService;
  comparisons: ComparisonService;
  researchReports: ResearchReportService;
  library: LibraryService;
  privateNotes: PrivateNotesService;
}

export async function routeLibraryApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: LibraryRouteServices,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/knowledge" && !url.pathname.startsWith("/api/knowledge/")) {
    return undefined;
  }

  requireCapability(principal, "knowledge:read");
  const scope = memberScope(principal);

  if (url.pathname === "/api/knowledge") {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const query = queryRecord(url, ["limit", "cursor", "spaceId", "collectionId", "tagId"]);
    return jsonResponse(await services.library.list(scope, pageRequest(query)), 200, context.requestId);
  }

  if (url.pathname === "/api/knowledge/search") {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    return jsonResponse(await services.library.search(scope, searchRequest(url)), 200, context.requestId);
  }

  const note = /^\/api\/knowledge\/([^/]+)\/note$/.exec(url.pathname);
  if (note) {
    requireNoQuery(url);
    const knowledgeItemId = decodePathId(note[1]!);
    const noteScope = memberScope(principal);
    if (request.method === "GET") {
      return jsonResponse({ note: await services.privateNotes.get(noteScope, knowledgeItemId) }, 200, context.requestId);
    }
    if (request.method === "PUT") {
      const input = strictRecord(
        await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
        ["title", "body", "citations"],
        "PRIVATE_NOTE_REQUEST_INVALID",
      );
      if (!hasExactKeys(input, ["title", "body", "citations"])) throw new AppError("PRIVATE_NOTE_REQUEST_INVALID", "Request body is invalid", 400);
      return jsonResponse({ note: await services.privateNotes.save(noteScope, knowledgeItemId, input as { title: unknown; body: unknown; citations: unknown }) }, 200, context.requestId);
    }
    return methodNotAllowed("GET, PUT", context);
  }

  if (url.pathname === "/api/knowledge/chat") {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["question", "scope"],
      "KNOWLEDGE_CHAT_REQUEST_INVALID",
    );
    if (!hasExactKeys(input, ["question", "scope"])) throw invalidChatRequest();
    const question = stringValue(input.question);
    const chatScope = chatScopeRequest(input.scope);
    const hits = await services.library.search(scope, { query: question, limit: 8 }, chatScope);
    return jsonResponse(
      await services.citedAnswers.answer(scope, question, hits.items),
      200,
      context.requestId,
    );
  }

  const summary = /^\/api\/knowledge\/([^/]+)\/summary$/.exec(url.pathname);
  if (summary) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const knowledgeItemId = decodePathId(summary[1]!);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["citationIds"],
      "SOURCE_SUMMARY_REQUEST_INVALID",
    );
    if (!hasExactKeys(input, ["citationIds"]) || !Array.isArray(input.citationIds) || input.citationIds.length < 1 || input.citationIds.length > 8 || !input.citationIds.every((id) => typeof id === "string" && id.length > 0)) {
      throw new AppError("SOURCE_SUMMARY_REQUEST_INVALID", "Request body is invalid", 400);
    }
    const citations = await Promise.all(input.citationIds.map((citationId) => services.library.readCitation(scope, citationId)));
    if (citations.some((citation) => citation.knowledgeItemId !== knowledgeItemId)) {
      throw new AppError("KNOWLEDGE_NOT_FOUND", "Knowledge item was not found", 404);
    }
    return jsonResponse(await services.sourceSummaries.summarize(scope, knowledgeItemId, citations), 200, context.requestId);
  }

  const faq = /^\/api\/knowledge\/([^/]+)\/faq$/.exec(url.pathname);
  if (faq) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const knowledgeItemId = decodePathId(faq[1]!);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["citationIds"],
      "FAQ_REQUEST_INVALID",
    );
    if (!hasExactKeys(input, ["citationIds"]) || !Array.isArray(input.citationIds) || input.citationIds.length < 1 || input.citationIds.length > 8 || !input.citationIds.every((id) => typeof id === "string" && id.length > 0)) {
      throw new AppError("FAQ_REQUEST_INVALID", "Request body is invalid", 400);
    }
    const citations = await Promise.all(input.citationIds.map((citationId) => services.library.readCitation(scope, citationId)));
    if (citations.some((citation) => citation.knowledgeItemId !== knowledgeItemId)) {
      throw new AppError("KNOWLEDGE_NOT_FOUND", "Knowledge item was not found", 404);
    }
    return jsonResponse(await services.faqs.generate(scope, knowledgeItemId, citations), 200, context.requestId);
  }

  const timeline = /^\/api\/knowledge\/([^/]+)\/timeline$/.exec(url.pathname);
  if (timeline) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const knowledgeItemId = decodePathId(timeline[1]!);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["citationIds"],
      "TIMELINE_REQUEST_INVALID",
    );
    if (!hasExactKeys(input, ["citationIds"]) || !Array.isArray(input.citationIds) || input.citationIds.length < 1 || input.citationIds.length > 8 || !input.citationIds.every((id) => typeof id === "string" && id.length > 0)) {
      throw new AppError("TIMELINE_REQUEST_INVALID", "Request body is invalid", 400);
    }
    const citations = await Promise.all(input.citationIds.map((citationId) => services.library.readCitation(scope, citationId)));
    if (citations.some((citation) => citation.knowledgeItemId !== knowledgeItemId)) {
      throw new AppError("KNOWLEDGE_NOT_FOUND", "Knowledge item was not found", 404);
    }
    return jsonResponse(await services.timelines.generate(scope, knowledgeItemId, citations), 200, context.requestId);
  }

  const brief = /^\/api\/knowledge\/([^/]+)\/brief$/.exec(url.pathname);
  if (brief) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const knowledgeItemId = decodePathId(brief[1]!);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["citationIds"],
      "BRIEF_REQUEST_INVALID",
    );
    if (!hasExactKeys(input, ["citationIds"]) || !Array.isArray(input.citationIds) || input.citationIds.length < 1 || input.citationIds.length > 8 || !input.citationIds.every((id) => typeof id === "string" && id.length > 0)) {
      throw new AppError("BRIEF_REQUEST_INVALID", "Request body is invalid", 400);
    }
    const citations = await Promise.all(input.citationIds.map((citationId) => services.library.readCitation(scope, citationId)));
    if (citations.some((citation) => citation.knowledgeItemId !== knowledgeItemId)) {
      throw new AppError("KNOWLEDGE_NOT_FOUND", "Knowledge item was not found", 404);
    }
    return jsonResponse(await services.briefs.generate(scope, knowledgeItemId, citations), 200, context.requestId);
  }

  const comparison = /^\/api\/knowledge\/([^/]+)\/comparison$/.exec(url.pathname);
  if (comparison) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const knowledgeItemId = decodePathId(comparison[1]!);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["citationIds"],
      "COMPARISON_REQUEST_INVALID",
    );
    if (!hasExactKeys(input, ["citationIds"]) || !Array.isArray(input.citationIds) || input.citationIds.length < 1 || input.citationIds.length > 8 || !input.citationIds.every((id) => typeof id === "string" && id.length > 0)) {
      throw new AppError("COMPARISON_REQUEST_INVALID", "Request body is invalid", 400);
    }
    const citations = await Promise.all(input.citationIds.map((citationId) => services.library.readCitation(scope, citationId)));
    if (citations.some((citation) => citation.knowledgeItemId !== knowledgeItemId)) {
      throw new AppError("KNOWLEDGE_NOT_FOUND", "Knowledge item was not found", 404);
    }
    return jsonResponse(await services.comparisons.compare(scope, knowledgeItemId, citations), 200, context.requestId);
  }

  const researchRun = /^\/api\/knowledge\/([^/]+)\/research-runs$/.exec(url.pathname);
  if (researchRun) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const knowledgeItemId = decodePathId(researchRun[1]!);
    await services.library.detail(scope, knowledgeItemId);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["goal"], "RESEARCH_RUN_REQUEST_INVALID");
    if (!hasExactKeys(input, ["goal"]) || typeof input.goal !== "string") throw new AppError("RESEARCH_RUN_REQUEST_INVALID", "Request body is invalid", 400);
    return jsonResponse({ researchRun: await services.researchReports.start(scope, knowledgeItemId, input.goal) }, 201, context.requestId);
  }

  const report = /^\/api\/knowledge\/([^/]+)\/report$/.exec(url.pathname);
  if (report) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const knowledgeItemId = decodePathId(report[1]!);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["researchRunId", "citationIds"], "RESEARCH_REPORT_REQUEST_INVALID");
    if (!hasExactKeys(input, ["researchRunId", "citationIds"]) || typeof input.researchRunId !== "string" || !Array.isArray(input.citationIds) || input.citationIds.length < 1 || input.citationIds.length > 8 || !input.citationIds.every((id) => typeof id === "string" && id.length > 0)) throw new AppError("RESEARCH_REPORT_REQUEST_INVALID", "Request body is invalid", 400);
    const citations = await Promise.all(input.citationIds.map((citationId) => services.library.readCitation(scope, citationId)));
    if (citations.some((citation) => citation.knowledgeItemId !== knowledgeItemId)) throw new AppError("KNOWLEDGE_NOT_FOUND", "Knowledge item was not found", 404);
    return jsonResponse(await services.researchReports.generate(scope, input.researchRunId, citations), 200, context.requestId);
  }

  const related = /^\/api\/knowledge\/([^/]+)\/related$/.exec(url.pathname);
  if (related) {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    return jsonResponse(
      { related: await services.library.related(scope, decodePathId(related[1]!)) },
      200,
      context.requestId,
    );
  }

  const backlinks = /^\/api\/knowledge\/([^/]+)\/backlinks$/.exec(url.pathname);
  if (backlinks) {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    return jsonResponse(
      { backlinks: await services.library.backlinks(scope, decodePathId(backlinks[1]!)) },
      200,
      context.requestId,
    );
  }

  const citation = /^\/api\/knowledge\/citations\/([^/]+)$/.exec(url.pathname);
  if (citation) {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    const citationId = decodePathId(citation[1]!);
    return jsonResponse(
      { citation: await services.library.readCitation(scope, citationId) },
      200,
      context.requestId,
    );
  }

  const download = /^\/api\/knowledge\/([^/]+)\/revisions\/([^/]+)\/download$/.exec(url.pathname);
  if (download) {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    const result = await services.library.download(
      scope,
      decodePathId(download[1]!),
      decodePathId(download[2]!),
    );
    return markdownAttachmentResponse(result.markdown, result.filename, context.requestId);
  }

  const revision = /^\/api\/knowledge\/([^/]+)\/revisions\/([^/]+)$/.exec(url.pathname);
  const revisionDiff = /^\/api\/knowledge\/([^/]+)\/revisions\/([^/]+)\/diff\/([^/]+)$/.exec(url.pathname);
  if (revisionDiff) {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    return jsonResponse(
      { diff: await services.library.diff(
        scope,
        decodePathId(revisionDiff[1]!),
        decodePathId(revisionDiff[2]!),
        decodePathId(revisionDiff[3]!),
      ) },
      200,
      context.requestId,
    );
  }
  if (revision) {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    const knowledgeItemId = decodePathId(revision[1]!);
    const revisionId = decodePathId(revision[2]!);
    return jsonResponse(
      { revision: await services.library.revision(scope, knowledgeItemId, revisionId) },
      200,
      context.requestId,
    );
  }

  const detail = /^\/api\/knowledge\/([^/]+)$/.exec(url.pathname);
  if (detail) {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    return jsonResponse(
      { knowledge: await services.library.detail(scope, decodePathId(detail[1]!)) },
      200,
      context.requestId,
    );
  }

  throw new AppError("NOT_FOUND", "Not found", 404);
}

function chatScopeRequest(value: unknown): ChatScope {
  if (!isRecord(value) || typeof value.kind !== "string") throw invalidChatRequest();
  if (value.kind === "all") {
    if (!hasExactKeys(value, ["kind"])) throw invalidChatRequest();
    return { kind: "all" };
  }
  if (value.kind === "space") {
    if (!hasExactKeys(value, ["kind", "spaceId"]) || !isChatResourceId(value.spaceId)) {
      throw invalidChatRequest();
    }
    return { kind: "space", spaceId: value.spaceId };
  }
  if (value.kind === "collection") {
    if (!hasExactKeys(value, ["collectionId", "kind"]) || !isChatResourceId(value.collectionId)) {
      throw invalidChatRequest();
    }
    return { kind: "collection", collectionId: value.collectionId };
  }
  if (value.kind === "items") {
    if (!hasExactKeys(value, ["kind", "knowledgeItemIds"])
      || !Array.isArray(value.knowledgeItemIds)
      || value.knowledgeItemIds.length < 1
      || value.knowledgeItemIds.length > 8
      || value.knowledgeItemIds.some((id) => !isChatResourceId(id))
      || new Set(value.knowledgeItemIds).size !== value.knowledgeItemIds.length) {
      throw invalidChatRequest();
    }
    return { kind: "items", knowledgeItemIds: [...value.knowledgeItemIds] };
  }
  throw invalidChatRequest();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isChatResourceId(value: unknown): value is string {
  return typeof value === "string"
    && /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,127})$/u.test(value);
}

function invalidChatRequest(): AppError {
  return new AppError(
    "KNOWLEDGE_CHAT_REQUEST_INVALID",
    "Knowledge chat request is invalid",
    400,
  );
}

function searchRequest(url: URL): SearchRequest {
  const allowed = ["q", "limit", "cursor", "spaceId", "collectionId", "tagId", "tagMode"];
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || (key !== "tagId" && url.searchParams.getAll(key).length !== 1)) {
      throw invalidRequest();
    }
  }
  const tagIds = url.searchParams.getAll("tagId");
  const tagMode = url.searchParams.get("tagMode");
  if ((tagIds.length === 0) !== (tagMode === null)) throw invalidRequest();
  if (tagMode !== null && tagMode !== "and" && tagMode !== "or") throw invalidRequest();
  const query: Record<string, string | undefined> = Object.create(null) as Record<string, string | undefined>;
  for (const key of ["q", "limit", "cursor", "spaceId", "collectionId"] as const) {
    query[key] = url.searchParams.get(key) ?? undefined;
  }
  const tagFilter: Pick<SearchRequest, "tagIds" | "tagMode"> = tagMode === null
    ? {}
    : { tagIds, tagMode };
  return {
    ...pageRequest(query),
    query: query.q ?? "",
    ...tagFilter,
  };
}

function memberScope(principal: Principal): LibraryScope {
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  return { memberId: principal.memberId, role: principal.role };
}

function queryRecord(url: URL, allowedKeys: readonly string[]): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = Object.create(null) as Record<string, string | undefined>;
  for (const key of url.searchParams.keys()) {
    if (!allowedKeys.includes(key) || url.searchParams.getAll(key).length !== 1) throw invalidRequest();
    result[key] = url.searchParams.get(key) ?? undefined;
  }
  return result;
}

function pageRequest(query: Record<string, string | undefined>) {
  return {
    ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    ...(query.spaceId === undefined ? {} : { spaceId: query.spaceId }),
    ...(query.collectionId === undefined ? {} : { collectionId: query.collectionId }),
    ...(query.tagId === undefined ? {} : { tagId: query.tagId }),
  };
}

function requireNoQuery(url: URL): void {
  if ([...url.searchParams.keys()].length !== 0) throw invalidRequest();
}

function invalidRequest(): AppError {
  return new AppError("LIBRARY_REQUEST_INVALID", "Library request is invalid", 400);
}

function markdownAttachmentResponse(markdown: string, filename: string, requestId: string): Response {
  return new Response(markdown, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "content-type": "text/markdown; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "x-request-id": requestId,
    },
  });
}
