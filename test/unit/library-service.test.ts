import { describe, expect, it } from "vitest";
import { AppError } from "../../src/http";
import type { PublishedContentReader } from "../../src/knowledge/types";
import {
  LibraryRepository,
  type AuthorizedChatScope,
  type AuthorizedCitationRecord,
  type AuthorizedRevisionRecord,
  type LibraryRepositoryPort,
  type RepositoryBacklinkCandidate,
  type RepositoryKnowledgePageRequest,
  type RepositorySearchRequest,
} from "../../src/library/repository";
import {
  decodeCitationId,
  encodeCitationId,
  LibraryService,
  normalizeSearchQuery,
} from "../../src/library/service";
import type { ChatScope, KnowledgePage, KnowledgePageRequest, LibraryScope, SearchPage } from "../../src/library/types";

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

  it("builds an authorized, bounded diff without exposing storage paths", async () => {
    const from = { ...revisionRecord(), revisionId: "revision-from", isCurrent: false, title: "Old title", normalizedPath: "/old", contentSha256: "b".repeat(64) };
    const to = { ...revisionRecord(), revisionId: "revision-to", normalizedPath: "/new", contentSha256: "c".repeat(64) };
    const repository = repositoryFixture({
      async findRevision(_scope, _knowledgeItemId, revisionId) {
        return revisionId === "revision-from" ? from : revisionId === "revision-to" ? to : null;
      },
    });
    const service = new LibraryService(repository, {
      async read(path) { return path === "/old" ? "# Old title\n\nBefore\n" : "# Trusted title\n\nAfter\n"; },
    });

    const diff = await service.diff(contributor, "knowledge-1", "revision-from", "revision-to");

    expect(diff).toMatchObject({
      fromRevisionId: "revision-from",
      toRevisionId: "revision-to",
      changed: true,
      stats: { added: 2, removed: 2, truncated: false },
    });
    expect(JSON.stringify(diff)).not.toMatch(/normalizedPath|contentSha256|\/old|\/new/);
  });

  it("uses the same not-found boundary for a hidden diff revision", async () => {
    const repository = repositoryFixture({
      async findRevision(_scope, _knowledgeItemId, revisionId) { return revisionId === "revision-from" ? revisionRecord() : null; },
    });
    await expect(new LibraryService(repository, noContentReader).diff(contributor, "knowledge-1", "revision-from", "revision-hidden"))
      .rejects.toEqual(notFoundError());
  });

  it("returns bounded related knowledge with explainable matched fields and excludes the seed", async () => {
    const repository = repositoryFixture({
      async search() {
        return {
          degraded: false,
          items: [
            { knowledgeItemId: "knowledge-1", title: "Seed", publishedAt: "2026-08-22", matchedFields: ["title"], citationId: "c1", spaceId: "default", collectionId: null, revisionId: "r1", chunkId: "c1", headingPath: [], startLine: 1, endLine: 1, excerpt: "seed", highlights: [], score: -1 },
            { knowledgeItemId: "knowledge-2", title: "Related", publishedAt: "2026-08-23", matchedFields: ["title", "body"], citationId: "c2", spaceId: "default", collectionId: null, revisionId: "r2", chunkId: "c2", headingPath: [], startLine: 1, endLine: 1, excerpt: "related", highlights: [], score: -2 },
          ],
        };
      },
    });
    const page = await new LibraryService(repository, { async read() { return "database retention guide"; } }).related(contributor, "knowledge-1");
    expect(page).toEqual({ items: [{ id: "knowledge-2", title: "Related", publishedAt: "2026-08-23", reasonFields: ["title", "body"] }] });
  });

  it("returns only explicit backlinks to visible current knowledge", async () => {
    const repository = repositoryFixture({
      async listBacklinkCandidates() {
        return [
          { knowledgeItemId: "knowledge-2", revisionId: "revision-2", chunkId: "chunk-2", title: "Links here", publishedAt: "2026-08-25", startLine: 4, endLine: 6, body: "See [[knowledge-1]] for the runbook." },
          { knowledgeItemId: "knowledge-3", revisionId: "revision-3", chunkId: "chunk-3", title: "False match", publishedAt: "2026-08-24", startLine: 1, endLine: 1, body: "knowledge-10 is unrelated." },
          { knowledgeItemId: "knowledge-4", revisionId: "revision-4", chunkId: "chunk-4", title: "Markdown link", publishedAt: "2026-08-23", startLine: 8, endLine: 9, body: "[Guide](/knowledge/knowledge-1)" },
        ];
      },
    });
    await expect(new LibraryService(repository, noContentReader).backlinks(contributor, "knowledge-1"))
      .resolves.toEqual({ items: [
        { id: "knowledge-2", revisionId: "revision-2", chunkId: "chunk-2", title: "Links here", publishedAt: "2026-08-25", startLine: 4, endLine: 6 },
        { id: "knowledge-4", revisionId: "revision-4", chunkId: "chunk-4", title: "Markdown link", publishedAt: "2026-08-23", startLine: 8, endLine: 9 },
      ] });
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

  it("writes a redacted knowledge.downloaded audit after authorized content delivery", async () => {
    const record = revisionRecord();
    const audits: unknown[] = [];
    const repository = repositoryFixture({ async findRevision() { return record; } });
    const service = new LibraryService(repository, {
      async read() { return "# Downloaded\n"; },
    }, {
      async writeAudit(input: unknown) { audits.push(input); return input as never; },
    } as never);

    await expect(service.download(contributor, "knowledge-1", "revision-1"))
      .resolves.toEqual({ markdown: "# Downloaded\n", filename: "Trusted title.md" });
    expect(audits).toEqual([expect.objectContaining({
      actorKind: "member", actorId: "member-1", action: "knowledge.downloaded",
      resourceType: "knowledge", resourceId: "knowledge-1", metadata: { revisionId: "revision-1" },
    })]);
    expect(JSON.stringify(audits)).not.toMatch(/content|markdown|normalizedPath|contentSha256|secret/i);
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

  it("normalizes list pagination and binds collection and tag filters to a Space", async () => {
    const requests: RepositoryKnowledgePageRequest[] = [];
    const repository = repositoryFixture({
      async list(_scope, request) { requests.push(request); return emptyKnowledgePage; },
    });
    const service = new LibraryService(repository, noContentReader);

    await service.list(contributor, { spaceId: "default" });
    expect(requests[0]).toMatchObject({ page: 1, pageSize: 20, spaceId: "default" });

    for (const request of [
      { page: 0 },
      { pageSize: 51 },
      { collectionId: "collection-1" },
      { tagId: "tag-1" },
      { spaceId: "../default" },
    ]) {
      await expect(service.list(contributor, request as KnowledgePageRequest)).rejects.toMatchObject({ status: 400 });
    }
    expect(requests).toHaveLength(1);
  });

  it("normalizes bounded type, author and publication-time filters for list", async () => {
    const requests: RepositoryKnowledgePageRequest[] = [];
    const repository = repositoryFixture({
      async list(_scope, request) { requests.push(request); return emptyKnowledgePage; },
    });
    await new LibraryService(repository, noContentReader).list(contributor, {
      kind: "code", authorId: "member-2", publishedFrom: "2026-01-01T00:00:00.000Z", publishedTo: "2026-12-31T23:59:59.999Z",
    });
    expect(requests[0]).toMatchObject({ kind: "code", authorId: "member-2", publishedFrom: "2026-01-01T00:00:00.000Z", publishedTo: "2026-12-31T23:59:59.999Z" });
    await expect(new LibraryService(repository, noContentReader).list(contributor, { kind: "binary" as never })).rejects.toMatchObject({ status: 400 });
    await expect(new LibraryService(repository, noContentReader).list(contributor, { publishedFrom: "2026-02-01T00:00:00.000Z", publishedTo: "2026-01-01T00:00:00.000Z" })).rejects.toMatchObject({ status: 400 });
  });

  it("preserves the bounded result count requested by internal search consumers", async () => {
    const items = Array.from({ length: 20 }, (_, index) => ({
      citationId: `citation-${index}`,
      knowledgeItemId: `knowledge-${index}`,
    })) as never[];
    const repository = repositoryFixture({
      async search() {
        return {
          items,
          degraded: false,
          pagination: { page: 1, pageSize: 20, total: 20, totalPages: 1 },
        } as never;
      },
    });

    const page = await new LibraryService(repository, noContentReader).search(
      contributor,
      { query: "worker", limit: 8 },
      { kind: "all" },
    );

    expect(page.items).toHaveLength(8);
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

  it("passes a bounded canonical FTS query and numbered page to the repository", async () => {
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
      page: 2,
      pageSize: 20,
    })).resolves.toBe(page);

    expect(requests).toEqual([expect.objectContaining({
      normalizedQuery: "Cloud 权限",
      matchQuery: "\"cloud\" AND \"权限\"",
      terms: ["cloud", "权限"],
      termKeys: ["CLOUD", "权限"],
      spaceId: "default",
      collectionId: "collection-1",
      tagId: "tag-1",
      page: 2,
      pageSize: 20,
    })]);
  });

  it("authorizes an explicit ChatScope before scoped retrieval and passes only the canonical D1 result", async () => {
    const events: string[] = [];
    const requests: RepositorySearchRequest[] = [];
    const requested: ChatScope = {
      kind: "items",
      knowledgeItemIds: ["knowledge-b", "knowledge-a"],
    };
    const authorized: AuthorizedChatScope = {
      kind: "items",
      knowledgeItemIds: ["knowledge-a", "knowledge-b"],
    };
    const repository = repositoryFixture({
      async authorizeScope() { events.push("authorize-member"); return true; },
      async authorizeChatScope(_scope, chatScope) {
        events.push(`authorize-chat:${JSON.stringify(chatScope)}`);
        return authorized;
      },
      async search(_scope, request) {
        events.push("search");
        requests.push(request);
        return { items: [], degraded: false };
      },
    });

    await new LibraryService(repository, noContentReader).search(
      contributor,
      { query: "launch latency", limit: 8 },
      requested,
    );

    expect(events).toEqual([
      "authorize-member",
      `authorize-chat:${JSON.stringify(requested)}`,
      "search",
    ]);
    expect(requests).toEqual([expect.objectContaining({ chatScope: authorized })]);
    expect(requests[0]!.chatScope).not.toBe(requested);
  });

  it("rejects malformed, mixed, duplicated, or unbounded item ChatScopes without widening to search", async () => {
    const events: string[] = [];
    const repository = repositoryFixture({
      async authorizeScope() { events.push("authorize-member"); return true; },
      async authorizeChatScope() { events.push("authorize-chat"); return null; },
      async search() { events.push("search"); return { items: [], degraded: false }; },
    });
    const service = new LibraryService(repository, noContentReader);
    const invalid = [
      { kind: "items", knowledgeItemIds: [] },
      { kind: "items", knowledgeItemIds: Array.from({ length: 9 }, (_, index) => `knowledge-${index}`) },
      { kind: "items", knowledgeItemIds: ["knowledge-a", "knowledge-a"] },
      { kind: "items", knowledgeItemIds: ["knowledge/a"] },
      { kind: "all", spaceId: "default" },
      { kind: "space", spaceId: "default", collectionId: "collection-a" },
      { kind: "collection", collectionId: "collection-a", knowledgeItemIds: ["knowledge-a"] },
      { kind: "unknown" },
    ] as unknown as ChatScope[];

    for (const chatScope of invalid) {
      await expect(service.search(contributor, { query: "launch", limit: 8 }, chatScope))
        .rejects.toMatchObject({ code: "KNOWLEDGE_CHAT_SCOPE_INVALID", status: 400 });
    }
    expect(events).toEqual(Array.from({ length: invalid.length }, () => "authorize-member"));
  });

  it("fails closed when any requested scope resource is absent or invisible", async () => {
    const events: string[] = [];
    const repository = repositoryFixture({
      async authorizeChatScope() { events.push("authorize-chat"); return null; },
      async search() { events.push("search"); return { items: [], degraded: false }; },
    });
    const service = new LibraryService(repository, noContentReader);

    await expect(service.search(contributor, { query: "launch", limit: 8 }, {
      kind: "items",
      knowledgeItemIds: ["knowledge-shared", "knowledge-hidden"],
    })).rejects.toMatchObject({ code: "KNOWLEDGE_CHAT_SCOPE_NOT_FOUND", status: 404 });
    expect(events).toEqual(["authorize-chat"]);
  });

  it("binds the canonical ChatScope into numbered search requests", async () => {
    const requests: RepositorySearchRequest[] = [];
    const repository = repositoryFixture({
      async authorizeChatScope(_scope, chatScope) {
        return chatScope as AuthorizedChatScope;
      },
      async search(_scope, request) {
        requests.push(request);
        return { items: [], degraded: false };
      },
    });
    const service = new LibraryService(repository, noContentReader);

    await service.search(contributor, { query: "launch", limit: 1 }, { kind: "all" });
    await service.search(contributor, { query: "launch", limit: 1 }, {
      kind: "space",
      spaceId: "default",
    });

    expect(requests.map(({ chatScope }) => chatScope)).toEqual([
      { kind: "all" },
      { kind: "space", spaceId: "default" },
    ]);
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
      page: 1,
      pageSize: 20,
    })]);

    await service.search(contributor, {
      query: "launch",
      spaceId: "default",
      tagIds: ["tag-a", "tag-z"],
      tagMode: "and",
    });
    expect(requests[1]).toEqual(requests[0]);

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
    const request = { page: 1, pageSize: 500 } as unknown as RepositoryKnowledgePageRequest;

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
    async authorizeChatScope(_scope, chatScope) { return chatScope as AuthorizedChatScope; },
    async list() { return emptyKnowledgePage; },
    async findCurrent() { return revisionRecord(); },
    async listBacklinkCandidates() { return []; },
    async findRevision() { return revisionRecord(); },
    async listRevisionChunks() { return { items: [] }; },
    async setChunkStatus(_scope, _knowledgeItemId, _revisionId, chunkId, status) { return { id: chunkId, status }; },
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
