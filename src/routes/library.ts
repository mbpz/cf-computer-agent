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
import type { LibraryScope, SearchRequest } from "../library/types";
import type { CitedAnswerService } from "../ai/cited-answer-service";
import { strictRecord, stringValue } from "./member";

export interface LibraryRouteServices {
  citedAnswers: CitedAnswerService;
  library: LibraryService;
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

  if (url.pathname === "/api/knowledge/chat") {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["question"],
      "KNOWLEDGE_CHAT_REQUEST_INVALID",
    );
    const question = stringValue(input.question);
    const hits = await services.library.search(scope, { query: question, limit: 8 });
    return jsonResponse(
      await services.citedAnswers.answer(scope, question, hits.items),
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

  const revision = /^\/api\/knowledge\/([^/]+)\/revisions\/([^/]+)$/.exec(url.pathname);
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
