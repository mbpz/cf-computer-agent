/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { PublishedContentReader } from "../../src/knowledge/types";
import { LibraryRepository } from "../../src/library/repository";
import { encodeCitationId, LibraryService } from "../../src/library/service";
import type { LibraryScope } from "../../src/library/types";
import { MIGRATIONS } from "../fixtures/d1";

const contributor: LibraryScope = { memberId: "member-1", role: "contributor" };
const admin: LibraryScope = { memberId: "admin-1", role: "admin" };
const disabled: LibraryScope = { memberId: "member-disabled", role: "contributor" };

describe("M1 permission-scoped library", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await seedPrincipalsAndSpaces();
  });

  it("lists only current visible active knowledge in the requested Space with gap-free keyset pages", async () => {
    await seedKnowledge({ id: "knowledge-a", revisionId: "revision-a", title: "A shared", visibility: "shared" });
    await seedKnowledge({ id: "knowledge-b", revisionId: "revision-b", title: "B shared", visibility: "shared" });
    await seedKnowledge({ id: "knowledge-admin", revisionId: "revision-admin", title: "Admin", visibility: "admin_only" });
    await seedKnowledge({ id: "knowledge-trashed", revisionId: "revision-trashed", title: "Trashed", visibility: "shared", status: "trashed" });
    await seedKnowledge({ id: "knowledge-other-space", revisionId: "revision-other-space", title: "Other", visibility: "shared", spaceId: "space-two" });
    const service = serviceWithContent();

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.list(contributor, { spaceId: "default", limit: 1, cursor });
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(seen).toEqual(["knowledge-b", "knowledge-a"]);
    expect(new Set(seen).size).toBe(seen.length);
    await expect(service.list(admin, { spaceId: "default", limit: 20 })).resolves.toMatchObject({
      items: [
        expect.objectContaining({ id: "knowledge-b", visibility: "shared", revisionId: "revision-b" }),
        expect.objectContaining({ id: "knowledge-admin", visibility: "admin_only", revisionId: "revision-admin" }),
        expect.objectContaining({ id: "knowledge-a", visibility: "shared", revisionId: "revision-a" }),
      ],
    });
    await expect(service.list(contributor, { spaceId: "space-two", limit: 20 })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "knowledge-other-space" })],
    });
    await expect(service.list(disabled, { limit: 20 })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("cross-checks the D1 member role instead of trusting a caller-claimed admin role", async () => {
    await seedKnowledge({ id: "knowledge-admin", revisionId: "revision-admin", title: "Admin", visibility: "admin_only" });
    const forged: LibraryScope = { memberId: "member-1", role: "admin" };
    const service = serviceWithContent();

    await expect(service.list(forged, { limit: 20 })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(service.detail(forged, "knowledge-admin")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("authorizes the stored D1 path and hash before reader access and hides invisible existence", async () => {
    await seedKnowledge({ id: "knowledge-shared", revisionId: "revision-shared", title: "Shared", visibility: "shared", markdown: "# Shared\n" });
    await seedKnowledge({ id: "knowledge-admin", revisionId: "revision-admin", title: "Admin", visibility: "admin_only", markdown: "# Admin\n" });
    const reads: Array<[string, string]> = [];
    const service = serviceWithContent(reads);

    await expect(service.detail(contributor, "knowledge-shared")).resolves.toMatchObject({
      id: "knowledge-shared",
      currentRevision: { id: "revision-shared", markdown: "# Shared\n" },
    });
    expect(reads).toEqual([[
      "/workspace/published/default/knowledge-shared/revision-shared.md",
      hashFor("revision-shared"),
    ]]);

    await expect(service.detail(contributor, "knowledge-admin")).rejects.toMatchObject({
      code: "KNOWLEDGE_NOT_FOUND", status: 404,
    });
    await expect(service.detail(contributor, "does-not-exist")).rejects.toMatchObject({
      code: "KNOWLEDGE_NOT_FOUND", status: 404,
    });
    expect(reads).toHaveLength(1);
  });

  it("reads a visible historical revision but never silently substitutes the current one", async () => {
    await seedKnowledge({
      id: "knowledge-history",
      revisionId: "revision-old",
      title: "Old admin",
      visibility: "admin_only",
      markdown: "# Old admin\n",
    });
    await addCurrentRevision({
      knowledgeItemId: "knowledge-history",
      revisionId: "revision-current",
      title: "Current shared",
      visibility: "shared",
      markdown: "# Current shared\n",
    });
    const service = serviceWithContent();

    await expect(service.detail(contributor, "knowledge-history")).resolves.toMatchObject({
      currentRevision: { id: "revision-current", markdown: "# Current shared\n", isCurrent: true },
    });
    await expect(service.revision(contributor, "knowledge-history", "revision-old"))
      .rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND", status: 404 });
    await expect(service.revision(admin, "knowledge-history", "revision-old")).resolves.toMatchObject({
      id: "revision-old", markdown: "# Old admin\n", isCurrent: false,
    });
  });

  it("searches Chinese bigrams and code identifiers while applying visibility and current-revision filters", async () => {
    await seedKnowledge({
      id: "knowledge-chinese",
      revisionId: "revision-chinese",
      title: "治理手册",
      visibility: "shared",
      body: "团队权限治理手册",
      searchBody: "团队权限治理手册 团队 队权 权限 限治 治理 理手 手册",
    });
    await seedKnowledge({
      id: "knowledge-code",
      revisionId: "revision-code",
      title: "Code",
      visibility: "shared",
      body: "const getUserByID = () => 42;",
      searchBody: "const getuserbyid _ 42",
    });
    await seedKnowledge({
      id: "knowledge-secret",
      revisionId: "revision-secret",
      title: "Secret",
      visibility: "admin_only",
      body: "权限治理 admin secret",
      searchBody: "权限治理 权限 限治 治理 admin secret",
    });
    await seedKnowledge({
      id: "knowledge-history-search",
      revisionId: "revision-history-old",
      title: "Old searchable",
      visibility: "shared",
      body: "obsolete_unique_token",
      searchBody: "obsolete_unique_token",
    });
    await addCurrentRevision({
      knowledgeItemId: "knowledge-history-search",
      revisionId: "revision-history-current",
      title: "Current",
      visibility: "shared",
      body: "current token",
      searchBody: "current token",
    });
    const service = serviceWithContent();

    await expect(service.search(contributor, { query: "权限 治理", limit: 20 })).resolves.toMatchObject({
      items: [expect.objectContaining({ knowledgeItemId: "knowledge-chinese", revisionId: "revision-chinese" })],
      degraded: false,
    });
    await expect(service.search(admin, { query: "权限 治理", limit: 20 })).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ knowledgeItemId: "knowledge-chinese" }),
        expect.objectContaining({ knowledgeItemId: "knowledge-secret" }),
      ]),
    });
    await expect(service.search(contributor, { query: "getUserByID", limit: 20 })).resolves.toMatchObject({
      items: [expect.objectContaining({ knowledgeItemId: "knowledge-code" })],
    });
    await expect(service.search(contributor, { query: "obsolete_unique_token", limit: 20 })).resolves.toMatchObject({
      items: [],
    });
  });

  it("uses stable rank/time/chunk keysets with no gaps or duplicates", async () => {
    await seedKnowledge({ id: "knowledge-a", revisionId: "revision-a", title: "Same", visibility: "shared", body: "stableterm", searchBody: "stableterm" });
    await seedKnowledge({ id: "knowledge-b", revisionId: "revision-b", title: "Same", visibility: "shared", body: "stableterm", searchBody: "stableterm" });
    await seedKnowledge({ id: "knowledge-c", revisionId: "revision-c", title: "Same", visibility: "shared", body: "stableterm", searchBody: "stableterm" });
    const service = serviceWithContent();
    const seen: string[] = [];
    let cursor: string | undefined;

    do {
      const page = await service.search(contributor, { query: "stableterm", limit: 1, cursor });
      seen.push(...page.items.map((item) => item.chunkId));
      cursor = page.nextCursor;
    } while (cursor);

    expect(seen).toEqual(["revision-a-chunk-0", "revision-b-chunk-0", "revision-c-chunk-0"]);
    expect(new Set(seen).size).toBe(3);
  });

  it("reports only authorized search degradation and keeps degraded knowledge readable", async () => {
    await seedKnowledge({
      id: "knowledge-degraded",
      revisionId: "revision-degraded",
      title: "Readable degraded",
      visibility: "shared",
      searchStatus: "search_degraded",
      markdown: "# Still readable\n",
      index: false,
    });
    await seedKnowledge({
      id: "knowledge-secret-degraded",
      revisionId: "revision-secret-degraded",
      title: "Secret degraded",
      visibility: "admin_only",
      searchStatus: "search_degraded",
      index: false,
    });
    const service = serviceWithContent();

    await expect(service.search(contributor, { query: "readable", limit: 20 })).resolves.toEqual({
      items: [],
      degraded: true,
    });
    await expect(service.detail(contributor, "knowledge-degraded")).resolves.toMatchObject({
      searchStatus: "search_degraded",
      currentRevision: { markdown: "# Still readable\n" },
    });

    await env.DB.prepare("UPDATE knowledge_items SET search_status = 'indexed' WHERE id = 'knowledge-degraded'").run();
    await expect(service.search(contributor, { query: "readable", limit: 20 })).resolves.toEqual({
      items: [],
      degraded: false,
    });
    await expect(service.search(admin, { query: "readable", limit: 20 })).resolves.toMatchObject({ degraded: true });
  });

  it("returns inert bounded excerpts and reauthorizes current citations without leaking old chunks", async () => {
    await seedKnowledge({
      id: "knowledge-citation",
      revisionId: "revision-citation",
      title: "Citation",
      visibility: "shared",
      body: "<script>alert(1)</script> safe citation body ".repeat(20),
      searchBody: "script alert safe citation body",
    });
    const service = serviceWithContent();
    const page = await service.search(contributor, { query: "safe", limit: 20 });
    const hit = page.items[0]!;

    expect([...hit.excerpt].length).toBeLessThanOrEqual(241);
    expect(hit.excerpt).not.toMatch(/<mark>|<b>/i);
    await expect(service.readCitation(contributor, hit.citationId)).resolves.toMatchObject({
      citationId: hit.citationId,
      revisionId: "revision-citation",
      chunkId: "revision-citation-chunk-0",
      body: expect.stringContaining("safe citation body"),
    });

    const oldCitation = encodeCitationId({
      revisionId: "revision-history-old",
      chunkId: "revision-history-old-chunk-0",
    });
    await expect(service.readCitation(contributor, oldCitation)).rejects.toMatchObject({
      code: "KNOWLEDGE_NOT_FOUND", status: 404,
    });
  });

  it("rejects malformed or scope-mismatched cursors instead of falling back to an unbounded scan", async () => {
    await seedKnowledge({ id: "knowledge-a", revisionId: "revision-a", title: "A", visibility: "shared", body: "cursor", searchBody: "cursor" });
    await seedKnowledge({ id: "knowledge-b", revisionId: "revision-b", title: "B", visibility: "shared", body: "cursor", searchBody: "cursor" });
    const service = serviceWithContent();
    const listCursor = (await service.list(contributor, { spaceId: "default", limit: 1 })).nextCursor!;
    const searchCursor = (await service.search(contributor, { query: "cursor", limit: 1 })).nextCursor!;

    await expect(service.list(contributor, { spaceId: "space-two", limit: 1, cursor: listCursor }))
      .rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID", status: 400 });
    await expect(service.search(contributor, { query: "different", limit: 1, cursor: searchCursor }))
      .rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID", status: 400 });
    await expect(service.search(contributor, { query: "cursor", limit: 1, cursor: `${searchCursor}x` }))
      .rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID", status: 400 });
  });
});

function serviceWithContent(reads: Array<[string, string]> = []): LibraryService {
  const reader: PublishedContentReader = {
    async read(path, hash) {
      reads.push([path, hash]);
      const row = await env.DB.prepare(
        "SELECT sv.content FROM revisions r JOIN source_versions sv ON sv.id = r.source_version_id WHERE r.normalized_path = ? AND r.content_sha256 = ? LIMIT 1",
      ).bind(path, hash).first<{ content: string }>();
      if (!row) throw new Error("published content not seeded");
      return row.content;
    },
  };
  return new LibraryService(new LibraryRepository(env.DB), reader);
}

async function seedPrincipalsAndSpaces(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('admin-1', 'github:admin', 'admin@example.test', 'admin', 'active', ?, ?)").bind(now, now),
    env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-1', 'github:member', 'member@example.test', 'contributor', 'active', ?, ?)").bind(now, now),
    env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-disabled', 'github:disabled', 'disabled@example.test', 'contributor', 'disabled', ?, ?)").bind(now, now),
    env.DB.prepare("INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at) VALUES ('space-two', 'space-two', 'Space Two', '', 'shared', 'active', 2, 0, ?, ?)").bind(now, now),
  ]);
}

interface SeedKnowledgeInput {
  id: string;
  revisionId: string;
  title: string;
  visibility: "shared" | "admin_only";
  spaceId?: string;
  status?: "active" | "trashed";
  searchStatus?: "indexed" | "search_degraded";
  markdown?: string;
  body?: string;
  searchBody?: string;
  index?: boolean;
}

async function seedKnowledge(input: SeedKnowledgeInput): Promise<void> {
  const spaceId = input.spaceId ?? "default";
  const markdown = input.markdown ?? `# ${input.title}\n\n${input.body ?? input.title}\n`;
  const body = input.body ?? input.title;
  const searchBody = input.searchBody ?? body.toLowerCase();
  const submissionId = `submission-${input.revisionId}`;
  const sourceId = `source-${input.revisionId}`;
  const sourceVersionId = `source-version-${input.revisionId}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, idempotency_key, created_at, updated_at) VALUES (?, 'member-1', ?, NULL, 'markdown', 'published', ?, ?, NULL, ?, ?)",
    ).bind(submissionId, spaceId, input.title, markdown, now, now),
    env.DB.prepare(
      "INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES (?, 'member-1', ?, NULL, 'markdown', ?, ?, ?)",
    ).bind(sourceId, spaceId, input.title, now, now),
    env.DB.prepare(
      "INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES (?, ?, ?, 1, ?, ?, 'm1-v1', ?)",
    ).bind(sourceVersionId, sourceId, submissionId, markdown, hashFor(input.revisionId), now),
    env.DB.prepare(
      "INSERT INTO knowledge_items (id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?)",
    ).bind(input.id, spaceId, input.status ?? "active", input.searchStatus ?? "indexed", now, now),
    env.DB.prepare(
      "INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES (?, ?, ?, ?, ?, ?, '[]', ?, 'admin-1', ?)",
    ).bind(input.revisionId, input.id, sourceVersionId, `/workspace/published/${spaceId}/${input.id}/${input.revisionId}.md`, hashFor(input.revisionId), input.title, input.visibility, now),
    env.DB.prepare("UPDATE knowledge_items SET current_revision_id = ? WHERE id = ?").bind(input.revisionId, input.id),
    env.DB.prepare(
      "INSERT INTO chunks (id, revision_id, ordinal, heading_path, start_line, end_line, body, search_title, search_tags, search_body) VALUES (?, ?, 0, '[\"Section\"]', 3, 3, ?, ?, '', ?)",
    ).bind(`${input.revisionId}-chunk-0`, input.revisionId, body, input.title, searchBody),
    ...(input.index === false ? [] : [env.DB.prepare(
      "INSERT INTO chunks_fts (chunk_id, title, tags, body) VALUES (?, ?, '', ?)",
    ).bind(`${input.revisionId}-chunk-0`, input.title, searchBody)]),
  ]);
}

async function addCurrentRevision(input: Omit<SeedKnowledgeInput, "id" | "spaceId" | "status" | "searchStatus"> & {
  knowledgeItemId: string;
}): Promise<void> {
  const item = await env.DB.prepare("SELECT space_id FROM knowledge_items WHERE id = ?")
    .bind(input.knowledgeItemId).first<{ space_id: string }>();
  if (!item) throw new Error("knowledge item missing");
  const markdown = input.markdown ?? `# ${input.title}\n\n${input.body ?? input.title}\n`;
  const body = input.body ?? input.title;
  const searchBody = input.searchBody ?? body.toLowerCase();
  const submissionId = `submission-${input.revisionId}`;
  const sourceId = `source-${input.revisionId}`;
  const sourceVersionId = `source-version-${input.revisionId}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, idempotency_key, created_at, updated_at) VALUES (?, 'member-1', ?, NULL, 'markdown', 'published', ?, ?, NULL, ?, ?)",
    ).bind(submissionId, item.space_id, input.title, markdown, now, now),
    env.DB.prepare(
      "INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES (?, 'member-1', ?, NULL, 'markdown', ?, ?, ?)",
    ).bind(sourceId, item.space_id, input.title, now, now),
    env.DB.prepare(
      "INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES (?, ?, ?, 1, ?, ?, 'm1-v1', ?)",
    ).bind(sourceVersionId, sourceId, submissionId, markdown, hashFor(input.revisionId), now),
    env.DB.prepare(
      "INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES (?, ?, ?, ?, ?, ?, '[]', ?, 'admin-1', ?)",
    ).bind(input.revisionId, input.knowledgeItemId, sourceVersionId, `/workspace/published/${item.space_id}/${input.knowledgeItemId}/${input.revisionId}.md`, hashFor(input.revisionId), input.title, input.visibility, now),
    env.DB.prepare("UPDATE knowledge_items SET current_revision_id = ?, updated_at = ? WHERE id = ?").bind(input.revisionId, now, input.knowledgeItemId),
    env.DB.prepare(
      "INSERT INTO chunks (id, revision_id, ordinal, heading_path, start_line, end_line, body, search_title, search_tags, search_body) VALUES (?, ?, 0, '[\"Section\"]', 3, 3, ?, ?, '', ?)",
    ).bind(`${input.revisionId}-chunk-0`, input.revisionId, body, input.title, searchBody),
    ...(input.index === false ? [] : [env.DB.prepare(
      "INSERT INTO chunks_fts (chunk_id, title, tags, body) VALUES (?, ?, '', ?)",
    ).bind(`${input.revisionId}-chunk-0`, input.title, searchBody)]),
  ]);
}

function hashFor(value: string): string {
  return value.padEnd(64, "0").slice(0, 64).replace(/[^a-f0-9]/g, "a");
}

const now = "2026-08-22T00:00:00.000Z";
