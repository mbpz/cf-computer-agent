import { describe, expect, it } from "vitest";
import { AppError } from "../../src/http";
import type { PublishedContentReader } from "../../src/knowledge/types";
import {
  LibraryRepository,
  type AuthorizedCitationRecord,
  type AuthorizedRevisionRecord,
  type LibraryRepositoryPort,
  type RepositoryKnowledgePageRequest,
  type RepositorySearchRequest,
} from "../../src/library/repository";
import {
  decodeCitationId,
  encodeCitationId,
  LibraryService,
  normalizeSearchQuery,
} from "../../src/library/service";
import type { KnowledgePage, LibraryScope, SearchPage } from "../../src/library/types";

const contributor: LibraryScope = { memberId: "member-1", role: "contributor" };
const admin: LibraryScope = { memberId: "admin-1", role: "admin" };

describe("LibraryService", () => {
  it("authorizes against D1 before loading an item or opening published content", async () => {
    const events: string[] = [];
    const record = revisionRecord();
    const repository = repositoryFixture({
      async authorizeScope() { events.push("authorize"); return true; },
      async findCurrent() { events.push("find-current"); return record; },
    });
    const reader: PublishedContentReader = {
      async read(path, expectedSha256) {
        events.push(`read:${path}:${expectedSha256}`);
        return "# Trusted\n";
      },
    };

    const detail = await new LibraryService(repository, reader).detail(contributor, "knowledge-1");

    expect(events).toEqual([
      "authorize",
      "find-current",
      `read:${record.normalizedPath}:${record.contentSha256}`,
    ]);
    expect(detail).toMatchObject({
      id: "knowledge-1",
      currentRevision: {
        id: "revision-1",
        markdown: "# Trusted\n",
        reviewerId: "admin-1",
        sourceVersionOrdinal: null,
        parserSchemaVersion: null,
        codeMetadata: null,
        indexStatus: "indexed",
      },
    });
    expect(detail).not.toHaveProperty("normalizedPath");
    expect(detail.currentRevision).not.toHaveProperty("contentSha256");
  });

  it("never calls the content reader for an absent or invisible item", async () => {
    let reads = 0;
    const repository = repositoryFixture({ async findCurrent() { return null; } });
    const service = new LibraryService(repository, {
      async read() { reads += 1; return "secret"; },
    });

    await expect(service.detail(contributor, "knowledge-secret")).rejects.toMatchObject({
      code: "KNOWLEDGE_NOT_FOUND",
      status: 404,
    });
    expect(reads).toBe(0);
  });

  it("uses the same not-found contract for hidden revisions and citations", async () => {
    const repository = repositoryFixture({
      async findRevision() { return null; },
      async findCitation() { return null; },
    });
    const service = new LibraryService(repository, noContentReader);
    const citationId = encodeCitationId({ revisionId: "revision-secret", chunkId: "chunk-secret" });

    await expect(service.revision(contributor, "knowledge-1", "revision-secret"))
      .rejects.toEqual(notFoundError());
    await expect(service.readCitation(contributor, citationId)).rejects.toEqual(notFoundError());
  });

  it("rejects a stale or forged member scope before any resource lookup", async () => {
    const calls: string[] = [];
    const repository = repositoryFixture({
      async authorizeScope() { calls.push("authorize"); return false; },
      async findCurrent() { calls.push("find-current"); return revisionRecord(); },
    });

    await expect(new LibraryService(repository, noContentReader).detail(admin, "knowledge-1"))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(calls).toEqual(["authorize"]);
  });

  it("normalizes list limits and binds collection and tag filters to a Space", async () => {
    const requests: RepositoryKnowledgePageRequest[] = [];
    const repository = repositoryFixture({
      async list(_scope, request) { requests.push(request); return emptyKnowledgePage; },
    });
    const service = new LibraryService(repository, noContentReader);

    await service.list(contributor, { spaceId: "default" });
    expect(requests[0]).toMatchObject({ limit: 20, spaceId: "default" });
    expect(requests[0]?.cursorKey).toMatch(/^[a-f0-9]{64}$/);

    for (const request of [
      { limit: 0 },
      { limit: 51 },
      { collectionId: "collection-1" },
      { tagId: "tag-1" },
      { spaceId: "../default" },
    ]) {
      await expect(service.list(contributor, request)).rejects.toMatchObject({ status: 400 });
    }
    expect(requests).toHaveLength(1);
  });

  it("quotes normalized Unicode/code terms so FTS operators remain inert", () => {
    expect(normalizeSearchQuery("  ＧｅｔUser_ID  权限治理  ")).toEqual({
      normalizedQuery: "GetUser_ID 权限治理",
      matchQuery: "\"getuser\" AND \"id\" AND \"权限治理\" AND \"权限\" AND \"限治\" AND \"治理\"",
      terms: ["getuser", "id", "权限治理", "权限", "限治", "治理"],
      termKeys: ["GETUSER", "ID", "权限治理", "权限", "限治", "治理"],
    });
    expect(normalizeSearchQuery("foo_bar")).toMatchObject({
      matchQuery: "\"foo\" AND \"bar\"",
      terms: ["foo", "bar"],
      termKeys: ["FOO", "BAR"],
    });
    expect(normalizeSearchQuery('foo" OR admin*')).toMatchObject({
      matchQuery: "\"foo\" AND \"or\" AND \"admin\"",
    });
  });

  it.each([
    "",
    "   ",
    "😀😀",
    "\nquery",
    "query\n",
    "\tquery",
    "query\t",
    "bad\u0000query",
    "bad\ud800query",
    "a".repeat(201),
    "  " + "a".repeat(199),
    "界".repeat(171),
    Array.from({ length: 33 }, (_, index) => `term${index}`).join(" "),
  ])("rejects an empty, unsafe, or unbounded search query", async (query) => {
    expect(() => normalizeSearchQuery(query)).toThrow(expect.objectContaining({
      code: "SEARCH_QUERY_INVALID",
      status: 400,
    }));
  });

  it("rechecks token comparison-key byte bounds after case folding", () => {
    const rawWithinBounds = "ƛ".repeat(200);
    expect([...rawWithinBounds]).toHaveLength(200);
    expect(new TextEncoder().encode(rawWithinBounds)).toHaveLength(400);

    expect(() => normalizeSearchQuery(rawWithinBounds)).toThrow(expect.objectContaining({
      code: "SEARCH_QUERY_INVALID",
      status: 400,
    }));
  });

  it("deduplicates unicode61-equivalent I variants without dropping dotless ı", () => {
    const normalized = normalizeSearchQuery("I i İ ı");

    expect(normalized).toMatchObject({
      matchQuery: "\"i\" AND \"ı\"",
      terms: ["i", "ı"],
      termKeys: ["I", "ı"],
    });
    expect(new Set(normalized.terms)).toHaveLength(2);
    expect(new Set(normalized.termKeys)).toHaveLength(2);
  });

  it("passes a bounded canonical FTS query and scope-bound cursor key to the repository", async () => {
    const requests: RepositorySearchRequest[] = [];
    const page: SearchPage = { items: [], degraded: true };
    const repository = repositoryFixture({
      async search(_scope, request) { requests.push(request); return page; },
    });
    const service = new LibraryService(repository, noContentReader);

    await expect(service.search(contributor, {
      query: "Cloud 权限",
      spaceId: "default",
      collectionId: "collection-1",
      tagId: "tag-1",
      limit: 7,
    })).resolves.toBe(page);

    expect(requests).toEqual([expect.objectContaining({
      normalizedQuery: "Cloud 权限",
      matchQuery: "\"cloud\" AND \"权限\"",
      terms: ["cloud", "权限"],
      termKeys: ["CLOUD", "权限"],
      spaceId: "default",
      collectionId: "collection-1",
      tagId: "tag-1",
      limit: 7,
    })]);
    expect(requests[0]?.cursorKey).toMatch(/^[a-f0-9]{64}$/);
  });

  it("canonicalizes bounded multi-Tag filters and binds the explicit mode and policy", async () => {
    const requests: RepositorySearchRequest[] = [];
    const repository = repositoryFixture({
      async search(_scope, request) { requests.push(request); return { items: [], degraded: false }; },
    });
    const service = new LibraryService(repository, noContentReader);

    await service.search(contributor, {
      query: "launch",
      spaceId: "default",
      tagIds: ["tag-z", "tag-a", "tag-z"],
      tagMode: "and",
    });

    expect(requests).toEqual([expect.objectContaining({
      tagIds: ["tag-a", "tag-z"],
      tagMode: "and",
      policyVersion: 2,
      limit: 20,
    })]);
    const canonicalKey = requests[0]!.cursorKey;

    await service.search(contributor, {
      query: "launch",
      spaceId: "default",
      tagIds: ["tag-a", "tag-z"],
      tagMode: "and",
    });
    expect(requests[1]!.cursorKey).toBe(canonicalKey);

    for (const request of [
      { query: "launch", spaceId: "default", tagIds: ["tag-a"] },
      { query: "launch", spaceId: "default", tagMode: "or" as const },
      { query: "launch", tagIds: ["tag-a"], tagMode: "or" as const },
      { query: "launch", spaceId: "default", tagId: "tag-a", tagIds: ["tag-b"], tagMode: "or" as const },
      { query: "launch", spaceId: "default", tagIds: Array.from({ length: 9 }, (_, index) => `tag-${index}`), tagMode: "or" as const },
      { query: "launch", spaceId: "default", tagIds: ["../tag"], tagMode: "and" as const },
    ]) {
      await expect(service.search(contributor, request)).rejects.toMatchObject({
        code: "LIBRARY_REQUEST_INVALID",
        status: 400,
      });
    }
    expect(requests).toHaveLength(2);
  });

  it("encodes citations as canonical versioned lookup keys and rejects all other payloads", () => {
    const citationId = encodeCitationId({ revisionId: "revision-知识", chunkId: "chunk-😀" });
    expect(citationId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(citationId).not.toContain("revision");
    expect(decodeCitationId(citationId)).toEqual({ revisionId: "revision-知识", chunkId: "chunk-😀" });

    for (const invalid of [
      "",
      b64({ v: 2, revisionId: "revision-1", chunkId: "chunk-1" }),
      b64({ v: 1, revisionId: "revision-1", chunkId: "chunk-1", path: "/secret" }),
      b64({ v: 1, revisionId: "", chunkId: "chunk-1" }),
    ]) {
      expect(() => decodeCitationId(invalid)).toThrow(expect.objectContaining({
        code: "CITATION_INVALID",
        status: 400,
      }));
    }
  });

  it("returns a citation only after reauthorization with its exact decoded revision and chunk", async () => {
    const calls: unknown[] = [];
    const citation = citationRecord();
    const repository = repositoryFixture({
      async findCitation(scope, revisionId, chunkId) {
        calls.push([scope, revisionId, chunkId]);
        return citation;
      },
    });
    const service = new LibraryService(repository, noContentReader);
    const citationId = encodeCitationId({ revisionId: citation.revisionId, chunkId: citation.chunkId });

    await expect(service.readCitation(contributor, citationId)).resolves.toEqual({
      ...citation,
      citationId,
    });
    expect(calls).toEqual([[contributor, "revision-1", "revision-1-chunk-0"]]);
  });
});

describe("LibraryRepository contract", () => {
  it("does not expose an unscoped path/hash/content lookup", () => {
    const methods = Object.getOwnPropertyNames(LibraryRepository.prototype);
    expect(methods).toEqual(expect.arrayContaining([
      "authorizeScope", "list", "findCurrent", "findRevision", "search", "findCitation",
    ]));
    expect(methods).not.toEqual(expect.arrayContaining([
      "findById", "findByPath", "read", "readContent", "getChunk",
    ]));
  });

  it("rejects an unbounded direct repository page before preparing D1 SQL", async () => {
    let prepares = 0;
    const repository = new LibraryRepository({
      prepare() { prepares += 1; throw new Error("D1 must not be reached"); },
    } as unknown as D1Database);
    const request = { limit: 500, cursorKey: "a".repeat(64) };

    await expect(repository.list(contributor, request)).rejects.toMatchObject({
      code: "PAGE_INVALID",
      status: 400,
    });
    expect(prepares).toBe(0);
  });
});

const emptyKnowledgePage: KnowledgePage = { items: [] };
const noContentReader: PublishedContentReader = {
  async read() { throw new Error("content reader must not be called"); },
};

function repositoryFixture(overrides: Partial<LibraryRepositoryPort> = {}): LibraryRepositoryPort {
  return {
    async authorizeScope() { return true; },
    async list() { return emptyKnowledgePage; },
    async findCurrent() { return revisionRecord(); },
    async findRevision() { return revisionRecord(); },
    async search() { return { items: [], degraded: false }; },
    async findCitation() { return citationRecord(); },
    ...overrides,
  };
}

function revisionRecord(): AuthorizedRevisionRecord {
  return {
    id: "knowledge-1",
    spaceId: "default",
    collectionId: null,
    status: "active",
    searchStatus: "indexed",
    updatedAt: "2026-08-22T00:00:00.000Z",
    revisionId: "revision-1",
    sourceVersionId: "source-version-1",
    title: "Trusted title",
    tagIds: ["tag-1"],
    visibility: "shared",
    publishedBy: "admin-1",
    publishedAt: "2026-08-22T00:00:00.000Z",
    normalizedPath: "/workspace/published/default/knowledge-1/revision-1.md",
    contentSha256: "a".repeat(64),
    isCurrent: true,
    chunks: [{
      id: "revision-1-chunk-0",
      ordinal: 0,
      headingPath: ["Trusted"],
      startLine: 3,
      endLine: 3,
    }],
  };
}

function citationRecord(): AuthorizedCitationRecord {
  return {
    knowledgeItemId: "knowledge-1",
    revisionId: "revision-1",
    chunkId: "revision-1-chunk-0",
    title: "Trusted title",
    headingPath: ["Trusted"],
    startLine: 3,
    endLine: 3,
    body: "Trusted citation body",
    publishedAt: "2026-08-22T00:00:00.000Z",
  };
}

function notFoundError(): AppError {
  return new AppError("KNOWLEDGE_NOT_FOUND", "Knowledge was not found", 404);
}

function b64(value: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(value))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
