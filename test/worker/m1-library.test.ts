/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { getWorkspace, type WorkspaceClient } from "@cloudflare/computer";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CitedAnswerService,
  type CitedAnswerAi,
  type CitedAnswerAiInput,
} from "../../src/ai/cited-answer-service";
import { computeEvidenceConfidence } from "../../src/ai/evidence-confidence";
import { AppError } from "../../src/http";
import { AuditRepository } from "../../src/audit/repository";
import type { KnowledgeBase } from "../../src/index";
import { createPublishedContentReader } from "../../src/knowledge/published-content";
import type { PublishedContentReader, PublishedContentReceipt, RpcResult } from "../../src/knowledge/types";
import { LibraryRepository } from "../../src/library/repository";
import { encodeCitationId, LibraryService } from "../../src/library/service";
import type { LibraryScope } from "../../src/library/types";
import { decodeOpaqueCursor, encodeOpaqueCursor } from "../../src/pagination";
import { PublicationRepository } from "../../src/publication/repository";
import type { SourceLocation } from "../../src/sources/chunker";
import { SpacesRepository } from "../../src/spaces/repository";
import { TagsRepository } from "../../src/tags/repository";
import { MIGRATIONS } from "../fixtures/d1";
import { M1_SEARCH_RANKING_CASES, M1_SEARCH_RANKING_DOCUMENTS } from "../fixtures/m1-search-ranking";

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

  it("keeps PDF page locations in reader citations", async () => {
    await seedKnowledge({
      id: "knowledge-pdf-location",
      revisionId: "revision-pdf-location",
      title: "PDF location",
      visibility: "shared",
      location: { kind: "pdf", page: 3 },
      markdown: "## Page 3\n\nPage three body\n",
    });
    const service = serviceWithContent();
    const detail = await service.detail(contributor, "knowledge-pdf-location");
    expect(detail.currentRevision.chunks[0]).toEqual(expect.objectContaining({ location: { kind: "pdf", page: 3 } }));
    const citation = await service.readCitation(contributor, detail.currentRevision.chunks[0]!.citationId);
    expect(citation.location).toEqual({ kind: "pdf", page: 3 });
  });

  it("recalls a child chunk and returns its bounded parent context", async () => {
    await seedKnowledge({
      id: "knowledge-parent-child",
      revisionId: "revision-parent-child",
      title: "Parent child",
      visibility: "shared",
      body: "Parent anchor context",
      searchBody: "parent anchor context",
    });
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO chunks (
          id, revision_id, ordinal, parent_chunk_id, heading_path, start_line, end_line, body,
          search_title, search_tags, search_body, index_field, location_json
        ) VALUES (?, ?, 1, ?, '["Section"]', 4, 4, ?, ?, '', ?, 'body', '{}')`,
      ).bind(
        "revision-parent-child-chunk-1",
        "revision-parent-child",
        "revision-parent-child-chunk-0",
        "Child retrieval signal",
        "Parent child",
        "child retrieval signal",
      ),
      env.DB.prepare(
        `INSERT INTO chunks_fts (rowid, chunk_id, title, summary, tags, body, code)
         SELECT rowid, id, ?, '', '', search_body, '' FROM chunks WHERE id = ?`,
      ).bind("Parent child", "revision-parent-child-chunk-1"),
      env.DB.prepare(
        `INSERT INTO chunks_fts_shared (rowid, chunk_id, title, summary, tags, body, code)
         SELECT rowid, id, ?, '', '', search_body, '' FROM chunks WHERE id = ?`,
      ).bind("Parent child", "revision-parent-child-chunk-1"),
    ]);

    const service = serviceWithContent();
    const search = await service.search(contributor, { query: "child retrieval signal", limit: 20 });
    const child = search.items.find((item) => item.chunkId === "revision-parent-child-chunk-1");
    expect(child).toMatchObject({ parentChunkId: "revision-parent-child-chunk-0" });
    const citation = await service.readCitation(contributor, child!.citationId);
    expect(citation.parent).toEqual({
      chunkId: "revision-parent-child-chunk-0",
      headingPath: ["Section"],
      startLine: 3,
      endLine: 3,
      body: "Parent anchor context",
    });
  });

  it("derives a safe failed status from the current terminal index Job while keeping knowledge readable", async () => {
    await seedKnowledge({
      id: "knowledge-terminal-index",
      revisionId: "revision-terminal-index",
      title: "Terminal index guide",
      visibility: "shared",
      searchStatus: "search_degraded",
      index: false,
      body: "Canonical readable terminal marker",
    });
    await env.DB.prepare(
      `INSERT INTO jobs (
         id, kind, resource_id, state, attempts, available_at, last_error_code, created_at, updated_at
       ) VALUES ('index-terminal', 'index_revision', 'revision-terminal-index',
         'failed_terminal', 3, ?, 'FTS_INDEX_FAILED', ?, ?)`,
    ).bind(now, now, now).run();
    const service = serviceWithContent();

    await expect(service.list(contributor, { limit: 20 })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "knowledge-terminal-index", searchStatus: "failed" })],
    });
    await expect(service.detail(contributor, "knowledge-terminal-index")).resolves.toMatchObject({
      currentRevision: {
        indexStatus: "failed",
        markdown: expect.stringContaining("Canonical readable terminal marker"),
      },
    });
    await expect(service.search(contributor, { query: "terminal marker", limit: 20 })).resolves.toEqual({
      items: [],
      degraded: true,
    });
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

  it("exposes only authorized Review and SourceVersion metadata after visibility succeeds", async () => {
    await seedKnowledge({
      id: "knowledge-metadata",
      revisionId: "revision-metadata",
      title: "Metadata",
      visibility: "shared",
    });
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE source_versions
         SET ordinal = 3, parser_schema_version = 'm1-v2', code_language = 'typescript',
           file_label = 'metadata.ts', line_baseline = 17
         WHERE id = 'source-version-revision-metadata'`,
      ),
      env.DB.prepare(
        `INSERT INTO reviews (
           id, submission_id, reviewer_id, decision, reason_code, reason, title, visibility, created_at
         ) VALUES (
           'review-metadata', 'submission-revision-metadata', 'admin-1', 'published',
           'approved', '', 'Metadata', 'shared', ?
         )`,
      ).bind(now),
    ]);
    const service = serviceWithContent();

    const detail = await service.detail(contributor, "knowledge-metadata");
    expect(detail.currentRevision).toMatchObject({
      sourceVersionId: "source-version-revision-metadata",
      reviewerId: "admin-1",
      sourceVersionOrdinal: 3,
      parserSchemaVersion: "m1-v2",
      codeMetadata: { language: "typescript", fileLabel: "metadata.ts", lineBaseline: 17 },
      indexStatus: "indexed",
    });
    expect(JSON.stringify(detail)).not.toMatch(/email|normalizedPath|contentSha256|sourceIdentity|provider/i);
  });

  it("reads exactly 256 authorized chunks and fails closed at 257 before reading content", async () => {
    await seedKnowledge({
      id: "knowledge-chunk-boundary",
      revisionId: "revision-chunk-boundary",
      title: "Chunk boundary",
      visibility: "shared",
    });
    await env.DB.prepare(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 255
       )
       INSERT INTO chunks (
         id, revision_id, ordinal, heading_path, start_line, end_line, body,
         search_title, search_tags, search_body
       )
       SELECT printf('revision-chunk-boundary-chunk-%03d', value),
         'revision-chunk-boundary', value, '[]', value + 3, value + 3,
         printf('body %d', value), 'Chunk boundary', '', printf('body %d', value)
       FROM sequence`,
    ).run();
    const reads: Array<[string, string]> = [];
    const service = serviceWithContent(reads);

    await expect(service.detail(contributor, "knowledge-chunk-boundary")).resolves.toMatchObject({
      currentRevision: { chunks: expect.arrayContaining([
        expect.objectContaining({ ordinal: 0 }),
        expect.objectContaining({ ordinal: 255 }),
      ]) },
    });
    const accepted = await service.detail(contributor, "knowledge-chunk-boundary");
    expect(accepted.currentRevision.chunks).toHaveLength(256);
    expect(reads).toHaveLength(2);

    await env.DB.prepare(
      `INSERT INTO chunks (
         id, revision_id, ordinal, heading_path, start_line, end_line, body,
         search_title, search_tags, search_body
       ) VALUES ('revision-chunk-boundary-chunk-256', 'revision-chunk-boundary', 256,
         '[]', 259, 259, 'body 256', 'Chunk boundary', '', 'body 256')`,
    ).run();
    await expect(service.detail(contributor, "knowledge-chunk-boundary"))
      .rejects.toMatchObject({ code: "KNOWLEDGE_DATA_INVALID", status: 500 });
    expect(reads).toHaveLength(2);

    await env.DB.prepare("DELETE FROM chunks WHERE revision_id = 'revision-chunk-boundary'").run();
    await expect(service.detail(contributor, "knowledge-chunk-boundary"))
      .rejects.toMatchObject({ code: "KNOWLEDGE_DATA_INVALID", status: 500 });
    expect(reads).toHaveLength(2);
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

  it("keeps a still-visible historical citation readable and makes hidden, inactive, and absent citations indistinguishable", async () => {
    await seedKnowledge({
      id: "knowledge-old-citation",
      revisionId: "revision-old-citation",
      title: "Old citation",
      visibility: "shared",
      body: "Historical citation body",
    });
    await addCurrentRevision({
      knowledgeItemId: "knowledge-old-citation",
      revisionId: "revision-new-citation",
      title: "New citation",
      visibility: "shared",
      body: "Current citation body",
    });
    await seedKnowledge({
      id: "knowledge-hidden-citation",
      revisionId: "revision-hidden-citation",
      title: "Hidden citation",
      visibility: "admin_only",
      body: "Hidden citation body",
    });
    await seedKnowledge({
      id: "knowledge-inactive-citation",
      revisionId: "revision-inactive-citation",
      title: "Inactive citation",
      visibility: "shared",
      spaceId: "space-two",
      body: "Inactive citation body",
    });
    await seedKnowledge({
      id: "knowledge-trashed-citation",
      revisionId: "revision-trashed-citation",
      title: "Trashed citation",
      visibility: "shared",
      status: "trashed",
      body: "Trashed citation body",
    });
    await env.DB.prepare("UPDATE spaces SET status = 'disabled' WHERE id = 'space-two'").run();
    const service = serviceWithContent();
    const oldCitation = encodeCitationId({
      revisionId: "revision-old-citation",
      chunkId: "revision-old-citation-chunk-0",
    });

    await expect(service.readCitation(contributor, oldCitation)).resolves.toEqual({
      citationId: oldCitation,
      knowledgeItemId: "knowledge-old-citation",
      revisionId: "revision-old-citation",
      chunkId: "revision-old-citation-chunk-0",
      title: "Old citation",
      headingPath: ["Section"],
      startLine: 3,
      endLine: 3,
      body: "Historical citation body",
      publishedAt: now,
    });

    const denied = await Promise.all([
      encodeCitationId({
        revisionId: "revision-hidden-citation",
        chunkId: "revision-hidden-citation-chunk-0",
      }),
      encodeCitationId({
        revisionId: "revision-inactive-citation",
        chunkId: "revision-inactive-citation-chunk-0",
      }),
      encodeCitationId({
        revisionId: "revision-trashed-citation",
        chunkId: "revision-trashed-citation-chunk-0",
      }),
      encodeCitationId({ revisionId: "revision-absent", chunkId: "revision-absent-chunk-0" }),
    ].map((citationId) => rejectedAppError(service.readCitation(contributor, citationId))));
    expect(denied).toEqual([
      { code: "KNOWLEDGE_NOT_FOUND", message: "Knowledge was not found", status: 404 },
      { code: "KNOWLEDGE_NOT_FOUND", message: "Knowledge was not found", status: 404 },
      { code: "KNOWLEDGE_NOT_FOUND", message: "Knowledge was not found", status: 404 },
      { code: "KNOWLEDGE_NOT_FOUND", message: "Knowledge was not found", status: 404 },
    ]);
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

  it("authorizes all, Space, Collection, and 1-8 selected-item ChatScopes before retrieval", async () => {
    await env.DB.prepare(
      `INSERT INTO collections (
         id, space_id, parent_id, name, description, status, position, created_at, updated_at
       ) VALUES ('collection-chat', 'default', NULL, 'Chat', '', 'active', 1, ?, ?)`,
    ).bind(now, now).run();
    await seedKnowledge({
      id: "knowledge-chat-collection", revisionId: "revision-chat-collection",
      title: "Scoped marker collection", visibility: "shared", body: "scopedmarker launch latency",
    });
    await env.DB.prepare(
      "UPDATE knowledge_items SET collection_id = 'collection-chat' WHERE id = 'knowledge-chat-collection'",
    ).run();
    await seedKnowledge({
      id: "knowledge-chat-default", revisionId: "revision-chat-default",
      title: "Scoped marker default", visibility: "shared", body: "scopedmarker launch latency",
    });
    await seedKnowledge({
      id: "knowledge-chat-space-two", revisionId: "revision-chat-space-two",
      title: "Scoped marker second Space", visibility: "shared", spaceId: "space-two",
      body: "scopedmarker launch latency",
    });
    const service = serviceWithContent();
    const ids = (items: Awaited<ReturnType<LibraryService["search"]>>["items"]): string[] => (
      items.map((item) => item.knowledgeItemId).sort()
    );

    expect(ids((await service.search(contributor, { query: "scopedmarker", limit: 8 }, {
      kind: "all",
    })).items)).toEqual([
      "knowledge-chat-collection", "knowledge-chat-default", "knowledge-chat-space-two",
    ]);
    expect(ids((await service.search(contributor, { query: "scopedmarker", limit: 8 }, {
      kind: "space", spaceId: "default",
    })).items)).toEqual(["knowledge-chat-collection", "knowledge-chat-default"]);
    expect(ids((await service.search(contributor, { query: "scopedmarker", limit: 8 }, {
      kind: "collection", collectionId: "collection-chat",
    })).items)).toEqual(["knowledge-chat-collection"]);
    expect(ids((await service.search(contributor, { query: "scopedmarker", limit: 8 }, {
      kind: "items", knowledgeItemIds: ["knowledge-chat-default", "knowledge-chat-collection"],
    })).items)).toEqual(["knowledge-chat-collection", "knowledge-chat-default"]);

    for (let index = 0; index < 6; index += 1) {
      await seedKnowledge({
        id: `knowledge-chat-selected-${index}`,
        revisionId: `revision-chat-selected-${index}`,
        title: `Selected ${index}`,
        visibility: "shared",
        body: "scopedmarker selected evidence",
      });
    }
    const selectedIds = [
      "knowledge-chat-collection",
      "knowledge-chat-default",
      ...Array.from({ length: 6 }, (_, index) => `knowledge-chat-selected-${index}`),
    ];
    const selected = await service.search(contributor, { query: "scopedmarker", limit: 8 }, {
      kind: "items", knowledgeItemIds: selectedIds,
    });
    expect(ids(selected.items)).toEqual([...selectedIds].sort());
  });

  it("fails closed for malformed, hidden, inactive, disabled, mixed, and role-drift ChatScopes", async () => {
    await env.DB.prepare(
      `INSERT INTO collections (
         id, space_id, parent_id, name, description, status, position, created_at, updated_at
       ) VALUES ('collection-chat-disabled', 'default', NULL, 'Disabled chat', '', 'disabled', 1, ?, ?)`,
    ).bind(now, now).run();
    await seedKnowledge({
      id: "knowledge-chat-visible", revisionId: "revision-chat-visible",
      title: "Visible", visibility: "shared", body: "closedmarker evidence",
    });
    await seedKnowledge({
      id: "knowledge-chat-hidden", revisionId: "revision-chat-hidden",
      title: "Hidden", visibility: "admin_only", body: "closedmarker evidence",
    });
    await seedKnowledge({
      id: "knowledge-chat-trashed", revisionId: "revision-chat-trashed",
      title: "Trashed", visibility: "shared", status: "trashed", body: "closedmarker evidence",
    });
    await seedKnowledge({
      id: "knowledge-chat-pending", revisionId: "revision-chat-pending",
      title: "Pending", visibility: "shared", body: "closedmarker evidence",
    });
    await env.DB.prepare(
      "UPDATE knowledge_items SET search_status = 'pending' WHERE id = 'knowledge-chat-pending'",
    ).run();
    await seedKnowledge({
      id: "knowledge-chat-disabled-collection", revisionId: "revision-chat-disabled-collection",
      title: "Disabled Collection", visibility: "shared", body: "closedmarker evidence",
    });
    await env.DB.prepare(
      "UPDATE knowledge_items SET collection_id = 'collection-chat-disabled' WHERE id = 'knowledge-chat-disabled-collection'",
    ).run();
    await seedKnowledge({
      id: "knowledge-chat-disabled-space", revisionId: "revision-chat-disabled-space",
      title: "Disabled Space", visibility: "shared", spaceId: "space-two", body: "closedmarker evidence",
    });
    await env.DB.prepare("UPDATE spaces SET status = 'disabled' WHERE id = 'space-two'").run();
    const prepared: string[] = [];
    const service = new LibraryService(
      new LibraryRepository(capturePreparedSql(env.DB, prepared)),
      noContentReader,
    );

    const malformed = [
      { kind: "items", knowledgeItemIds: [] },
      { kind: "items", knowledgeItemIds: Array.from({ length: 9 }, (_, index) => `knowledge-${index}`) },
      { kind: "items", knowledgeItemIds: ["knowledge-chat-visible", "knowledge-chat-visible"] },
      { kind: "all", spaceId: "default" },
    ] as const;
    for (const chatScope of malformed) {
      await expect(service.search(
        contributor,
        { query: "closedmarker", limit: 8 },
        chatScope as never,
      )).rejects.toMatchObject({ code: "KNOWLEDGE_CHAT_SCOPE_INVALID", status: 400 });
    }

    for (const chatScope of [
      { kind: "space", spaceId: "absent-space" },
      { kind: "space", spaceId: "space-two" },
      { kind: "collection", collectionId: "collection-chat-disabled" },
      { kind: "items", knowledgeItemIds: ["knowledge-absent"] },
      { kind: "items", knowledgeItemIds: ["knowledge-chat-hidden"] },
      { kind: "items", knowledgeItemIds: ["knowledge-chat-trashed"] },
      { kind: "items", knowledgeItemIds: ["knowledge-chat-pending"] },
      { kind: "items", knowledgeItemIds: ["knowledge-chat-disabled-collection"] },
      { kind: "items", knowledgeItemIds: ["knowledge-chat-disabled-space"] },
      { kind: "items", knowledgeItemIds: ["knowledge-chat-visible", "knowledge-chat-hidden"] },
    ] as const) {
      await expect(service.search(
        contributor,
        { query: "closedmarker", limit: 8 },
        chatScope as never,
      )).rejects.toMatchObject({ code: "KNOWLEDGE_CHAT_SCOPE_NOT_FOUND", status: 404 });
    }
    await expect(service.search(
      { memberId: contributor.memberId, role: "admin" },
      { query: "closedmarker", limit: 8 },
      { kind: "all" },
    )).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(prepared.some((sql) => sql.includes(" MATCH ?"))).toBe(false);
  });

  it("binds ChatScope to cursor replay and keeps unrelated corpus growth from changing scoped context", async () => {
    await seedKnowledge({
      id: "knowledge-chat-invariant-a", revisionId: "revision-chat-invariant-a",
      title: "Launch latency A", visibility: "shared", body: "Launch latency has a measured budget.",
    });
    await seedKnowledge({
      id: "knowledge-chat-invariant-b", revisionId: "revision-chat-invariant-b",
      title: "Launch latency B", visibility: "shared", body: "Launch latency has a rollback threshold.",
    });
    const service = serviceWithContent();
    const chatScope = {
      kind: "items" as const,
      knowledgeItemIds: ["knowledge-chat-invariant-a", "knowledge-chat-invariant-b"],
    };
    const before = await service.search(contributor, { query: "launch latency", limit: 1 }, chatScope);
    expect(before.nextCursor).toBeDefined();
    await expect(service.search(contributor, {
      query: "launch latency", limit: 1, cursor: before.nextCursor,
    }, chatScope)).resolves.toMatchObject({
      items: [expect.objectContaining({ knowledgeItemId: "knowledge-chat-invariant-b" })],
    });
    await expect(service.search(contributor, {
      query: "launch latency", limit: 1, cursor: before.nextCursor,
    }, { kind: "space", spaceId: "default" })).rejects.toMatchObject({
      code: "PAGE_CURSOR_INVALID", status: 400,
    });

    const beforeAll = await service.search(contributor, { query: "launch latency", limit: 8 }, chatScope);
    for (let index = 0; index < 24; index += 1) {
      await seedKnowledge({
        id: `knowledge-chat-unrelated-${index}`,
        revisionId: `revision-chat-unrelated-${index}`,
        title: `Vacation ${index}`,
        visibility: index % 2 === 0 ? "shared" : "admin_only",
        body: "Directory contacts and holiday policy.",
      });
    }
    const after = await service.search(contributor, { query: "launch latency", limit: 1 }, chatScope);
    const afterAll = await service.search(contributor, { query: "launch latency", limit: 8 }, chatScope);
    expect(after.nextCursor).toBe(before.nextCursor);
    await expect(service.search(contributor, {
      query: "launch latency", limit: 1, cursor: before.nextCursor,
    }, chatScope)).resolves.toMatchObject({
      items: [expect.objectContaining({ knowledgeItemId: "knowledge-chat-invariant-b" })],
    });
    expect(afterAll.items.map(({ score: _score, ...hit }) => hit))
      .toEqual(beforeAll.items.map(({ score: _score, ...hit }) => hit));
    expect(computeEvidenceConfidence("launch latency", afterAll.items))
      .toBe(computeEvidenceConfidence("launch latency", beforeAll.items));

    const contexts: string[] = [];
    const ai: CitedAnswerAi = {
      async run(_model, input): Promise<unknown> {
        contexts.push(input.messages[1]!.content);
        const context = JSON.parse(input.messages[1]!.content.split("输入 JSON：\n")[1]!) as {
          sources: Array<{ citationId: string }>;
        };
        return { response: JSON.stringify({
          claims: [{ text: "Scoped evidence is consistent.", citationIds: context.sources.map(({ citationId }) => citationId) }],
          insufficientEvidence: false,
        }) };
      },
    };
    const answers = new CitedAnswerService(ai);
    const beforeAnswer = await answers.answer(contributor, "launch latency", beforeAll.items);
    const afterAnswer = await answers.answer(contributor, "launch latency", afterAll.items);
    expect(afterAnswer.evidenceConfidence).toBe(beforeAnswer.evidenceConfidence);
    expect(contexts[1]).toBe(contexts[0]);
  });

  it("keeps contributor BM25 scores, order, and cursor bytes isolated from admin-only corpus changes", async () => {
    await seedKnowledge({
      id: "knowledge-isolation-a", revisionId: "revision-isolation-a", title: "Shared A",
      visibility: "shared", body: "isolationterm contributor evidence",
    });
    await seedKnowledge({
      id: "knowledge-isolation-b", revisionId: "revision-isolation-b", title: "Shared B",
      visibility: "shared", body: "isolationterm contributor evidence",
    });
    const service = serviceWithContent();
    const contributorBefore = await service.search(contributor, { query: "isolationterm", limit: 1 });
    const adminBefore = await service.search(admin, { query: "isolationterm", limit: 20 });

    for (let index = 0; index < 12; index += 1) {
      await seedKnowledge({
        id: `knowledge-isolation-admin-${index}`,
        revisionId: `revision-isolation-admin-${index}`,
        title: "isolationterm admin-only",
        visibility: "admin_only",
        body: `isolationterm hidden evidence ${index}`,
      });
    }

    const contributorAfter = await service.search(contributor, { query: "isolationterm", limit: 1 });
    const adminAfter = await service.search(admin, { query: "isolationterm", limit: 20 });

    expect(contributorBefore.nextCursor).toBeDefined();
    expect(contributorAfter).toEqual(contributorBefore);
    expect(adminAfter.items.map((item) => item.knowledgeItemId))
      .not.toEqual(adminBefore.items.map((item) => item.knowledgeItemId));
    expect(adminAfter.items.some((item) => item.knowledgeItemId.startsWith("knowledge-isolation-admin-")))
      .toBe(true);
  });

  it("uses the fixed field weights and returns exact server-derived match explanations", async () => {
    await seedKnowledge({
      id: "knowledge-rank-title", revisionId: "revision-rank-title", title: "rankterm title",
      visibility: "shared", body: "literal <script>alert(1)</script> 😀 filler",
    });
    await seedKnowledge({
      id: "knowledge-rank-tags", revisionId: "revision-rank-tags", title: "Tag document",
      visibility: "shared", body: "literal tag body", searchTags: "rankterm",
    });
    await seedKnowledge({
      id: "knowledge-rank-summary", revisionId: "revision-rank-summary", title: "Summary document",
      visibility: "shared", summary: "rankterm summary", body: "literal summary body",
    });
    await seedKnowledge({
      id: "knowledge-rank-code", revisionId: "revision-rank-code", title: "Code document",
      visibility: "shared", body: "😀 const rankterm = '<img onerror=alert(1)>';", indexField: "code",
      searchBody: "const rankterm img onerror alert",
    });
    await seedKnowledge({
      id: "knowledge-rank-body", revisionId: "revision-rank-body", title: "Body document",
      visibility: "shared", body: "body rankterm evidence", searchBody: "body rankterm evidence",
    });

    const page = await serviceWithContent().search(contributor, { query: "rankterm", limit: 20 });

    expect(page.items.map((hit) => hit.knowledgeItemId)).toEqual([
      "knowledge-rank-title",
      "knowledge-rank-tags",
      "knowledge-rank-summary",
      "knowledge-rank-code",
      "knowledge-rank-body",
    ]);
    expect(page.items.map((hit) => hit.matchedFields)).toEqual([
      ["title"], ["tags"], ["summary"], ["code"], ["body"],
    ]);
    const codeHit = page.items[3]!;
    expect(codeHit.excerpt).toBe("😀 const rankterm = '<img onerror=alert(1)>';");
    expect(codeHit.highlights).toEqual([{ start: 8, end: 16 }]);
    expect(codeHit.excerpt).not.toContain("<mark>");
  });

  it("meets every exact top-five expectation in the independent 30-Revision corpus", async () => {
    expect(M1_SEARCH_RANKING_DOCUMENTS).toHaveLength(30);
    for (const document of M1_SEARCH_RANKING_DOCUMENTS) {
      await seedKnowledge({
        ...document,
        revisionId: `revision-${document.id}`,
        visibility: document.visibility ?? "shared",
      });
    }
    await env.DB.prepare("UPDATE spaces SET status = 'disabled' WHERE id = 'space-two'").run();
    const service = serviceWithContent();

    for (const rankingCase of M1_SEARCH_RANKING_CASES) {
      const page = await service.search(contributor, { query: rankingCase.query, limit: 5 });
      expect(page.items.map((hit) => hit.knowledgeItemId)).toEqual(rankingCase.expectedTopFive);
      expect(page.items.map((hit) => hit.matchedFields)).toEqual(rankingCase.expectedMatchedFields);
      expect(page.items.map((hit) => hit.highlights)).toEqual(rankingCase.expectedHighlights);
    }
  });

  it("applies bounded active same-Space Tag AND/OR filters before ranking", async () => {
    await seedTag("tag-a", "default", "active");
    await seedTag("tag-b", "default", "active");
    await seedTag("tag-disabled", "default", "disabled");
    await seedTag("tag-other", "space-two", "active");
    await seedKnowledge({ id: "knowledge-tag-a", revisionId: "revision-tag-a", title: "A", visibility: "shared", body: "filterterm", tagIds: ["tag-a"] });
    await seedKnowledge({ id: "knowledge-tag-b", revisionId: "revision-tag-b", title: "B", visibility: "shared", body: "filterterm", tagIds: ["tag-b"] });
    await seedKnowledge({ id: "knowledge-tag-ab", revisionId: "revision-tag-ab", title: "AB", visibility: "shared", body: "filterterm", tagIds: ["tag-a", "tag-b"] });

    const service = serviceWithContent();
    const ids = async (tagIds: string[], tagMode: "and" | "or") => (
      (await service.search(contributor, { query: "filterterm", spaceId: "default", tagIds, tagMode })).items
        .map((hit) => hit.knowledgeItemId).sort()
    );

    await expect(ids(["tag-a", "tag-b"], "and")).resolves.toEqual(["knowledge-tag-ab"]);
    await expect(ids(["tag-a", "tag-b"], "or")).resolves.toEqual([
      "knowledge-tag-a", "knowledge-tag-ab", "knowledge-tag-b",
    ]);
    await expect(ids(["tag-a", "tag-disabled"], "and")).resolves.toEqual([]);
    await expect(ids(["tag-other"], "or")).resolves.toEqual([]);
    await expect(ids(["tag-absent"], "or")).resolves.toEqual([]);

    const first = await service.search(contributor, {
      query: "filterterm", spaceId: "default", tagIds: ["tag-a", "tag-b"], tagMode: "or", limit: 1,
    });
    expect(first.nextCursor).toBeDefined();
    await expect(service.search(contributor, {
      query: "filterterm", spaceId: "default", tagIds: ["tag-a", "tag-b"], tagMode: "or",
      limit: 2, cursor: first.nextCursor,
    })).resolves.toMatchObject({ items: expect.any(Array) });
    await expect(service.search(contributor, {
      query: "filterterm", spaceId: "default", tagIds: ["tag-a", "tag-b"], tagMode: "and",
      limit: 1, cursor: first.nextCursor,
    })).rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID", status: 400 });
  });

  it("fails closed for disabled, absent, and cross-Space single Tag filters in list and search", async () => {
    await seedTag("tag-active", "default", "active");
    await seedTag("tag-disabled", "default", "disabled");
    await seedTag("tag-other", "space-two", "active");
    await seedKnowledge({
      id: "knowledge-tag-active-a", revisionId: "revision-tag-active-a", title: "Active A",
      visibility: "shared", body: "singletagterm", tagIds: ["tag-active"],
    });
    await seedKnowledge({
      id: "knowledge-tag-active-b", revisionId: "revision-tag-active-b", title: "Active B",
      visibility: "shared", body: "singletagterm", tagIds: ["tag-active"],
    });
    await seedKnowledge({
      id: "knowledge-tag-disabled", revisionId: "revision-tag-disabled", title: "Disabled secret",
      visibility: "shared", body: "singletagterm disabled-metadata", tagIds: ["tag-disabled"],
    });
    await seedKnowledge({
      id: "knowledge-tag-other", revisionId: "revision-tag-other", title: "Cross-space secret",
      visibility: "shared", body: "singletagterm cross-space-metadata", tagIds: ["tag-other"],
    });
    await seedKnowledge({
      id: "knowledge-tag-admin", revisionId: "revision-tag-admin", title: "Admin secret",
      visibility: "admin_only", body: "singletagterm admin-metadata", tagIds: ["tag-active"],
    });
    const service = serviceWithContent();

    const first = await service.list(contributor, { spaceId: "default", tagId: "tag-active", limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.id).toMatch(/^knowledge-tag-active-/u);
    expect(first.nextCursor).toBeDefined();
    const second = await service.list(contributor, {
      spaceId: "default", tagId: "tag-active", limit: 1, cursor: first.nextCursor,
    });
    expect(new Set([...first.items, ...second.items].map(({ id }) => id))).toEqual(new Set([
      "knowledge-tag-active-a", "knowledge-tag-active-b",
    ]));
    await expect(service.list(contributor, {
      spaceId: "default", tagId: "tag-disabled", limit: 20,
    })).resolves.toEqual({ items: [] });
    await expect(service.list(contributor, {
      spaceId: "default", tagId: "tag-other", limit: 20,
    })).resolves.toEqual({ items: [] });
    await expect(service.list(contributor, {
      spaceId: "default", tagId: "tag-absent", limit: 20,
    })).resolves.toEqual({ items: [] });

    await expect(service.search(contributor, {
      query: "singletagterm", spaceId: "default", tagId: "tag-active", limit: 20,
    })).resolves.toMatchObject({
      items: [
        expect.objectContaining({ knowledgeItemId: expect.stringMatching(/^knowledge-tag-active-/u) }),
        expect.objectContaining({ knowledgeItemId: expect.stringMatching(/^knowledge-tag-active-/u) }),
      ],
      degraded: false,
    });
    for (const tagId of ["tag-disabled", "tag-other", "tag-absent"]) {
      const page = await service.search(contributor, {
        query: "singletagterm", spaceId: "default", tagId, limit: 20,
      });
      expect(page).toEqual({ items: [], degraded: false });
      expect(JSON.stringify(page)).not.toMatch(/disabled-metadata|cross-space-metadata|admin-metadata/u);
    }
    await expect(service.list(contributor, {
      spaceId: "default", tagId: "tag-active", limit: 1, cursor: first.nextCursor,
    })).resolves.toMatchObject({ items: [expect.any(Object)] });
    await expect(service.list(contributor, {
      spaceId: "default", tagId: "tag-disabled", limit: 1, cursor: first.nextCursor,
    })).rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID", status: 400 });

    const contributorIds = (await service.search(contributor, {
      query: "singletagterm", spaceId: "default", tagId: "tag-active", limit: 20,
    })).items.map(({ knowledgeItemId }) => knowledgeItemId);
    expect(contributorIds).not.toContain("knowledge-tag-admin");
    expect((await service.search(admin, {
      query: "singletagterm", spaceId: "default", tagId: "tag-active", limit: 20,
    })).items.map(({ knowledgeItemId }) => knowledgeItemId)).toContain("knowledge-tag-admin");
  });

  it("fails closed for disabled, absent, and cross-Space Collection filters", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at) VALUES ('collection-active', 'default', NULL, 'Active', '', 'active', 1, ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at) VALUES ('collection-disabled', 'default', NULL, 'Disabled', '', 'disabled', 2, ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at) VALUES ('collection-other', 'space-two', NULL, 'Other', '', 'active', 1, ?, ?)").bind(now, now),
    ]);
    await seedKnowledge({ id: "knowledge-collection", revisionId: "revision-collection", title: "Collection", visibility: "shared", body: "collectionfilter" });
    await env.DB.prepare("UPDATE knowledge_items SET collection_id = 'collection-active' WHERE id = 'knowledge-collection'").run();
    const service = serviceWithContent();

    await expect(service.search(contributor, {
      query: "collectionfilter", spaceId: "default", collectionId: "collection-active",
    })).resolves.toMatchObject({ items: [expect.objectContaining({ knowledgeItemId: "knowledge-collection" })] });

    for (const collectionId of ["collection-disabled", "collection-other", "collection-absent"]) {
      await env.DB.prepare("UPDATE knowledge_items SET collection_id = ? WHERE id = 'knowledge-collection'")
        .bind(collectionId === "collection-absent" ? null : collectionId).run();
      await expect(service.search(contributor, {
        query: "collectionfilter", spaceId: "default", collectionId,
      })).resolves.toEqual({ items: [], degraded: false });
    }
  });

  it("atomically removes a disabled Collection from unfiltered search and requires reindex after reactivation", async () => {
    const spaces = new SpacesRepository(env.DB);
    await spaces.createCollection({
      id: "collection-activity", spaceId: "default", parentId: null, name: "Activity",
      description: "", status: "active", position: 1, createdAt: now, updatedAt: now,
    });
    await seedKnowledge({
      id: "knowledge-collection-activity", revisionId: "revision-collection-activity",
      title: "Collection activity", visibility: "shared", body: "collectionactivityterm",
    });
    await env.DB.prepare(
      "UPDATE knowledge_items SET collection_id = 'collection-activity' WHERE id = 'knowledge-collection-activity'",
    ).run();
    const service = serviceWithContent();
    await expect(service.search(contributor, { query: "collectionactivityterm" }))
      .resolves.toMatchObject({ items: [expect.objectContaining({ knowledgeItemId: "knowledge-collection-activity" })] });

    await spaces.updateCollection("collection-activity", {
      status: "disabled", updatedAt: "2026-08-22T00:01:00.000Z",
    });

    await expect(service.search(contributor, { query: "collectionactivityterm" }))
      .resolves.toEqual({ items: [], degraded: false });
    await expect(indexActivityState("knowledge-collection-activity")).resolves.toEqual({
      searchStatus: "pending", jobState: "pending", adminRows: 0, sharedRows: 0,
    });
    await expect(new PublicationRepository(env.DB).processIndexJob("revision-collection-activity"))
      .resolves.toBe("pending");
    await expect(indexActivityState("knowledge-collection-activity")).resolves.toEqual({
      searchStatus: "pending", jobState: "pending", adminRows: 0, sharedRows: 0,
    });

    await spaces.updateCollection("collection-activity", {
      status: "active", updatedAt: "2026-08-22T00:02:00.000Z",
    });
    await expect(service.search(contributor, { query: "collectionactivityterm" }))
      .resolves.toEqual({ items: [], degraded: false });
    await expect(new PublicationRepository(env.DB).processIndexJob("revision-collection-activity"))
      .resolves.toBe("indexed");
    await expect(service.search(contributor, { query: "collectionactivityterm" }))
      .resolves.toMatchObject({ items: [expect.objectContaining({ knowledgeItemId: "knowledge-collection-activity" })] });
  });

  it("invalidates a disabled Space corpus and keeps reactivation pending until reindex", async () => {
    await seedKnowledge({
      id: "knowledge-space-activity", revisionId: "revision-space-activity",
      title: "Space activity", visibility: "shared", spaceId: "space-two", body: "spaceactivityterm",
    });
    const spaces = new SpacesRepository(env.DB);
    const service = serviceWithContent();
    await expect(service.search(contributor, { query: "spaceactivityterm", spaceId: "space-two" }))
      .resolves.toMatchObject({ items: [expect.objectContaining({ knowledgeItemId: "knowledge-space-activity" })] });

    await spaces.updateSpace("space-two", {
      status: "disabled", updatedAt: "2026-08-22T00:01:00.000Z",
    });
    await expect(indexActivityState("knowledge-space-activity")).resolves.toEqual({
      searchStatus: "pending", jobState: "pending", adminRows: 0, sharedRows: 0,
    });

    await spaces.updateSpace("space-two", {
      status: "active", updatedAt: "2026-08-22T00:02:00.000Z",
    });
    await expect(service.search(contributor, { query: "spaceactivityterm", spaceId: "space-two" }))
      .resolves.toEqual({ items: [], degraded: false });
    await expect(new PublicationRepository(env.DB).processIndexJob("revision-space-activity"))
      .resolves.toBe("indexed");
    await expect(service.search(contributor, { query: "spaceactivityterm", spaceId: "space-two" }))
      .resolves.toMatchObject({ items: [expect.objectContaining({ knowledgeItemId: "knowledge-space-activity" })] });
  });

  it("lets a concurrent Collection disable win before an index replacement becomes visible", async () => {
    const spaces = new SpacesRepository(env.DB);
    await spaces.createCollection({
      id: "collection-index-race", spaceId: "default", parentId: null, name: "Race",
      description: "", status: "active", position: 2, createdAt: now, updatedAt: now,
    });
    await seedKnowledge({
      id: "knowledge-index-race", revisionId: "revision-index-race", title: "Index race",
      visibility: "shared", body: "indexraceterm",
    });
    await env.DB.prepare(
      "UPDATE knowledge_items SET collection_id = 'collection-index-race' WHERE id = 'knowledge-index-race'",
    ).run();
    await spaces.updateCollection("collection-index-race", {
      status: "disabled", updatedAt: "2026-08-22T00:01:00.000Z",
    });
    await spaces.updateCollection("collection-index-race", {
      status: "active", updatedAt: "2026-08-22T00:02:00.000Z",
    });

    let enterBatch!: () => void;
    let releaseBatch!: () => void;
    const entered = new Promise<void>((resolve) => { enterBatch = resolve; });
    const released = new Promise<void>((resolve) => { releaseBatch = resolve; });
    let paused = false;
    const racingDb = new Proxy(env.DB, {
      get(target, property) {
        if (property === "batch") {
          return async (statements: D1PreparedStatement[]) => {
            if (!paused) {
              paused = true;
              enterBatch();
              await released;
            }
            return target.batch(statements);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const indexing = new PublicationRepository(racingDb, {
      now: () => new Date("2026-08-22T00:03:00.000Z"),
      leaseToken: () => "collection-race-indexer",
    }).processIndexJob("revision-index-race");
    await entered;
    await spaces.updateCollection("collection-index-race", {
      status: "disabled", updatedAt: "2026-08-22T00:04:00.000Z",
    });
    releaseBatch();

    await expect(indexing).resolves.toBe("pending");
    await expect(indexActivityState("knowledge-index-race")).resolves.toEqual({
      searchStatus: "pending", jobState: "pending", adminRows: 0, sharedRows: 0,
    });
  });

  it("rolls back corpus invalidation when an audited Space status mutation fails", async () => {
    await seedKnowledge({
      id: "knowledge-space-rollback", revisionId: "revision-space-rollback",
      title: "Space rollback", visibility: "shared", spaceId: "space-two", body: "spacerollbackterm",
    });
    const audit = new AuditRepository(env.DB);
    await audit.writeAudit({
      id: "duplicate-space-status-audit", actorKind: "member", actorId: "admin-1",
      action: "space.updated", resourceType: "space", resourceId: "unrelated",
      metadata: { previousStatus: "active", newStatus: "disabled" }, createdAt: now,
    });
    const spaces = new SpacesRepository(env.DB, audit);

    await expect(spaces.updateSpaceWithAudit("space-two", {
      status: "disabled", updatedAt: "2026-08-22T00:01:00.000Z",
    }, {
      id: "duplicate-space-status-audit", actorKind: "member", actorId: "admin-1",
      action: "space.updated", resourceType: "space", resourceId: "space-two",
      metadata: { previousStatus: "active", newStatus: "disabled" },
      createdAt: "2026-08-22T00:01:00.000Z",
    })).rejects.toThrow();

    await expect(spaces.findSpaceById("space-two")).resolves.toMatchObject({ status: "active" });
    await expect(indexActivityState("knowledge-space-rollback")).resolves.toEqual({
      searchStatus: "indexed", jobState: "completed", adminRows: 1, sharedRows: 1,
    });
    await expect(serviceWithContent().search(contributor, {
      query: "spacerollbackterm", spaceId: "space-two",
    })).resolves.toMatchObject({
      items: [expect.objectContaining({ knowledgeItemId: "knowledge-space-rollback" })],
    });
  });

  it("invalidates stale Tag text and keeps reactivated Tags nonsearchable until the bounded index job completes", async () => {
    await seedTag("statusmarker", "default", "active");
    await seedKnowledge({
      id: "knowledge-tag-activity", revisionId: "revision-tag-activity",
      title: "Tag activity", visibility: "shared", body: "ordinary evidence",
      searchTags: "statusmarker", tagIds: ["statusmarker"],
    });
    const tags = new TagsRepository(env.DB);
    const service = serviceWithContent();
    await expect(service.search(contributor, { query: "statusmarker" }))
      .resolves.toMatchObject({ items: [expect.objectContaining({ knowledgeItemId: "knowledge-tag-activity" })] });

    await tags.updateStatus("statusmarker", "disabled", "2026-08-22T00:01:00.000Z");

    await expect(service.search(contributor, { query: "statusmarker" }))
      .resolves.toEqual({ items: [], degraded: false });
    await expect(indexActivityState("knowledge-tag-activity")).resolves.toEqual({
      searchStatus: "pending", jobState: "pending", adminRows: 0, sharedRows: 0,
    });

    await tags.updateStatus("statusmarker", "active", "2026-08-22T00:02:00.000Z");
    await expect(service.search(contributor, { query: "statusmarker" }))
      .resolves.toEqual({ items: [], degraded: false });
    await expect(new PublicationRepository(env.DB).processIndexJob("revision-tag-activity"))
      .resolves.toBe("indexed");
    await expect(service.search(contributor, { query: "statusmarker" }))
      .resolves.toMatchObject({ items: [expect.objectContaining({ knowledgeItemId: "knowledge-tag-activity" })] });
  });

  it("centers excerpts on exact lexical tokens instead of prefixed substrings", async () => {
    await seedKnowledge({
      id: "knowledge-substring-only",
      revisionId: "revision-substring-only",
      title: "Substring-only handbook",
      visibility: "shared",
      body: "prelaunch postlatency cannot satisfy exact search tokens",
      searchBody: "prelaunch postlatency cannot satisfy exact search tokens",
    });
    await seedKnowledge({
      id: "knowledge-excerpt-token-boundary",
      revisionId: "revision-excerpt-token-boundary",
      title: "Token boundary handbook",
      visibility: "shared",
      body: `prelaunch postlatency ${"unrelated filler ".repeat(40)}launch latency resolved`,
      searchBody: `prelaunch postlatency ${"unrelated filler ".repeat(40)}launch latency resolved`,
    });
    const service = serviceWithContent();

    const page = await service.search(contributor, { query: "launch latency", limit: 20 });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.knowledgeItemId).toBe("knowledge-excerpt-token-boundary");
    expect(page.items[0]!.excerpt).toContain("launch latency resolved");
    expect(page.items[0]!.excerpt).not.toContain("prelaunch postlatency");

    const stuffed = await service.search(contributor, {
      query: "prelaunch postlatency launch latency",
      limit: 20,
    });
    const ai: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<never> {
        this.calls += 1;
        throw new Error("query stuffing must not elevate partial bounded evidence");
      },
    };
    await expect(new CitedAnswerService(ai).answer(
      contributor,
      "prelaunch postlatency launch latency",
      stuffed.items,
    )).resolves.toEqual(citedRefusal(0.3417));
    expect(ai.calls).toBe(0);
  });

  it("shares underscore, case, and NFKC token semantics from D1 search through cited answers", async () => {
    await seedKnowledge({
      id: "knowledge-foo-bar",
      revisionId: "revision-foo-bar",
      title: "Foo bar guide",
      visibility: "shared",
      body: "foo bar rollout requires review",
      searchBody: "foo bar rollout requires review",
    });
    const library = serviceWithContent();

    const ascii = await library.search(contributor, { query: "foo_bar", limit: 20 });
    const compatibility = await library.search(contributor, { query: "ＦＯＯ_ＢＡＲ", limit: 20 });

    expect(ascii.items).toHaveLength(1);
    expect(compatibility.items).toEqual(ascii.items);
    const hit = compatibility.items[0]!;
    const ai: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<unknown> {
        this.calls += 1;
        return { response: JSON.stringify({
          claims: [{ text: "The foo bar rollout requires review.", citationIds: [hit.citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };

    await expect(new CitedAnswerService(ai).answer(contributor, "ＦＯＯ_ＢＡＲ", compatibility.items))
      .resolves.toMatchObject({
        answer: "The foo bar rollout requires review. [1]",
        citations: [hit.citationId],
        evidenceConfidence: 0.85,
      });
    expect(ai.calls).toBe(1);
  });

  it("matches Greek final-sigma variants consistently across D1 excerpts and cited answers", async () => {
    await seedKnowledge({
      id: "knowledge-greek-sigma",
      revisionId: "revision-greek-sigma",
      title: "Greek case-folding handbook",
      visibility: "shared",
      body: `${"unrelated preface ".repeat(40)}ΟΣ verified control`,
      searchBody: `${"unrelated preface ".repeat(40)}ΟΣ verified control`,
    });
    const library = serviceWithContent();

    const pages = await Promise.all(["ΟΣ", "ος", "οσ"].map((query) => (
      library.search(contributor, { query, limit: 20 })
    )));

    for (const page of pages) {
      expect(page.items).toHaveLength(1);
      expect(page.items[0]!.excerpt).toContain("ΟΣ verified control");
    }
    const hit = pages[2]!.items[0]!;
    const ai: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<unknown> {
        this.calls += 1;
        return { response: JSON.stringify({
          claims: [{ text: "The sigma control is verified.", citationIds: [hit.citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };

    await expect(new CitedAnswerService(ai).answer(contributor, "οσ", [hit]))
      .resolves.toMatchObject({
        answer: "The sigma control is verified. [1]",
        citations: [hit.citationId],
        evidenceConfidence: 0.7,
      });
    expect(ai.calls).toBe(1);
  });

  it("preserves D1 sharp-s case equivalence without inventing an SS expansion match", async () => {
    await seedKnowledge({
      id: "knowledge-sharp-s",
      revisionId: "revision-sharp-s",
      title: "German case-folding handbook",
      visibility: "shared",
      body: `${"unrelated preface ".repeat(40)}Straße verified control`,
      searchBody: `${"unrelated preface ".repeat(40)}Straße verified control`,
    });
    const library = serviceWithContent();

    const lower = await library.search(contributor, { query: "straße", limit: 20 });
    const capitalSharp = await library.search(contributor, { query: "STRAẞE", limit: 20 });
    const expanded = await library.search(contributor, { query: "STRASSE", limit: 20 });

    expect(lower.items).toHaveLength(1);
    expect(capitalSharp.items).toEqual(lower.items);
    expect(lower.items[0]!.excerpt).toContain("Straße verified control");
    expect(expanded.items).toEqual([]);

    const hit = capitalSharp.items[0]!;
    const ai: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<unknown> {
        this.calls += 1;
        return { response: JSON.stringify({
          claims: [{ text: "The Straße control is verified.", citationIds: [hit.citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };
    await expect(new CitedAnswerService(ai).answer(contributor, "STRAẞE", [hit]))
      .resolves.toMatchObject({
        answer: "The Straße control is verified. [1]",
        citations: [hit.citationId],
        evidenceConfidence: 0.7,
      });
    expect(ai.calls).toBe(1);
  });

  it("keeps dotless ı distinct from D1 I/i/İ equivalence in excerpts and answers", async () => {
    await seedKnowledge({
      id: "knowledge-i-only",
      revisionId: "revision-i-only",
      title: "ASCII case handbook",
      visibility: "shared",
      body: "I verified alone",
      searchBody: "i verified alone",
    });
    await seedKnowledge({
      id: "knowledge-dotless-only",
      revisionId: "revision-dotless-only",
      title: "Dotless case handbook",
      visibility: "shared",
      body: "ı verified alone",
      searchBody: "ı verified alone",
    });
    await seedKnowledge({
      id: "knowledge-i-and-dotless",
      revisionId: "revision-i-and-dotless",
      title: "Combined case handbook",
      visibility: "shared",
      body: `I ${"unrelated filler ".repeat(40)}ı verified control`,
      searchBody: `i ${"unrelated filler ".repeat(40)}ı verified control`,
    });
    const library = serviceWithContent();

    const ascii = await library.search(contributor, { query: "I", limit: 20 });
    const lower = await library.search(contributor, { query: "i", limit: 20 });
    const dotted = await library.search(contributor, { query: "İ", limit: 20 });
    const dotless = await library.search(contributor, { query: "ı", limit: 20 });
    const combined = await library.search(contributor, { query: "I ı", limit: 20 });
    const ids = (page: typeof ascii): string[] => page.items
      .map((hit) => hit.knowledgeItemId).sort();

    expect(ids(ascii)).toEqual(["knowledge-i-and-dotless", "knowledge-i-only"]);
    expect(ids(lower)).toEqual(ids(ascii));
    expect(ids(dotted)).toEqual(ids(ascii));
    expect(ids(dotless)).toEqual(["knowledge-dotless-only", "knowledge-i-and-dotless"]);
    expect(ids(combined)).toEqual(["knowledge-i-and-dotless"]);

    const combinedHit = combined.items[0]!;
    expect(combinedHit.excerpt).toContain("ı verified control");
    expect(combinedHit.excerpt).not.toMatch(/(?:^|\s)I(?:\s|$)/u);

    const dotlessHit = dotless.items.find((hit) => (
      hit.knowledgeItemId === "knowledge-i-and-dotless"
    ))!;
    const inputs: CitedAnswerAiInput[] = [];
    const dotlessAi: CitedAnswerAi = {
      async run(_model, input): Promise<unknown> {
        inputs.push(input);
        return { response: JSON.stringify({
          claims: [{ text: "The dotless control is verified.", citationIds: [dotlessHit.citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };
    await expect(new CitedAnswerService(dotlessAi).answer(contributor, "ı", [dotlessHit]))
      .resolves.toMatchObject({
        answer: "The dotless control is verified. [1]",
        citations: [dotlessHit.citationId],
        evidenceConfidence: 0.7,
      });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.messages[1]!.content).toContain("ı verified control");

    const combinedAi: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<never> {
        this.calls += 1;
        throw new Error("early ASCII I must not satisfy the dotless constraint");
      },
    };
    await expect(new CitedAnswerService(combinedAi).answer(contributor, "I ı", [combinedHit]))
      .resolves.toEqual(citedRefusal(0.275));
    expect(combinedAi.calls).toBe(0);
  });

  it("answers only from contributor-authorized current search hits and rejects a hidden citation", async () => {
    for (let index = 0; index < 6; index += 1) {
      await seedKnowledge({
        id: `knowledge-answer-decoy-${index}`,
        revisionId: `revision-answer-decoy-${index}`,
        title: `Unrelated answer decoy ${index}`,
        visibility: "shared",
        body: "vacation policy directory contact details",
        searchBody: "vacation policy directory contact details",
      });
    }
    await seedKnowledge({
      id: "knowledge-answer-shared",
      revisionId: "revision-answer-shared",
      title: "Shared answer",
      visibility: "shared",
      body: "trustedanswer current shared evidence",
      searchBody: "trustedanswer current shared evidence",
    });
    await seedKnowledge({
      id: "knowledge-answer-secret",
      revisionId: "revision-answer-secret",
      title: "Secret answer",
      visibility: "admin_only",
      body: "trustedanswer admin_only hidden evidence",
      searchBody: "trustedanswer admin_only hidden evidence",
    });
    const library = serviceWithContent();
    const page = await library.search(contributor, { query: "trustedanswer", limit: 20 });
    const sharedHit = page.items[0]!;
    const hiddenCitation = encodeCitationId({
      revisionId: "revision-answer-secret",
      chunkId: "revision-answer-secret-chunk-0",
    });
    const inputs: CitedAnswerAiInput[] = [];
    let citationId = sharedHit.citationId;
    const ai: CitedAnswerAi = {
      async run(_model, input): Promise<unknown> {
        inputs.push(input);
        return { response: JSON.stringify({
          claims: [{ text: "Current shared evidence.", citationIds: [citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };
    const answers = new CitedAnswerService(ai);

    expect(page.items).toHaveLength(1);
    expect(sharedHit).toMatchObject({
      knowledgeItemId: "knowledge-answer-shared",
      revisionId: "revision-answer-shared",
    });
    await expect(answers.answer(contributor, "trustedanswer", page.items)).resolves.toEqual({
      answer: "Current shared evidence. [1]",
      citations: [sharedHit.citationId],
      sources: [sharedHit],
      evidenceConfidence: 0.7,
    });
    const context = JSON.parse(inputs[0]!.messages[1]!.content.split("输入 JSON：\n")[1]!) as {
      sources: Array<{ citationId: string; excerpt: string }>;
    };
    expect(context.sources).toEqual([expect.objectContaining({
      citationId: sharedHit.citationId,
      excerpt: expect.stringContaining("shared evidence"),
    })]);
    expect(JSON.stringify(context)).not.toContain("admin_only hidden evidence");
    expect(JSON.stringify(context)).not.toContain(hiddenCitation);

    citationId = hiddenCitation;
    await expect(answers.answer(contributor, "trustedanswer", page.items)).rejects.toMatchObject({
      code: "ANSWER_UNGROUNDED",
      status: 422,
    });
  });

  it("accepts strong English evidence with real tiny-corpus FTS5 scores", async () => {
    await seedKnowledge({
      id: "knowledge-tiny-english",
      revisionId: "revision-tiny-english",
      title: "Launch latency review",
      visibility: "shared",
      body: "Launch latency was caused by a compressed test window.",
      searchBody: "launch latency compressed test window",
    });
    const library = serviceWithContent();
    const page = await library.search(contributor, { query: "launch latency", limit: 20 });
    const hit = page.items[0]!;

    expect(page.items).toHaveLength(1);
    expect(hit.score).toBeLessThan(0);
    expect(Math.abs(hit.score)).toBeLessThan(0.001);

    const ai: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<unknown> {
        this.calls += 1;
        return { response: JSON.stringify({
          claims: [{ text: "The compressed test window caused launch latency.", citationIds: [hit.citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };
    await expect(new CitedAnswerService(ai).answer(contributor, "launch latency", [hit]))
      .resolves.toMatchObject({
        answer: "The compressed test window caused launch latency. [1]",
        citations: [hit.citationId],
        evidenceConfidence: 0.85,
      });
    expect(ai.calls).toBe(1);
  });

  it("accepts strong Han evidence with real tiny-corpus FTS5 scores", async () => {
    await seedKnowledge({
      id: "knowledge-tiny-han",
      revisionId: "revision-tiny-han",
      title: "权限治理手册",
      visibility: "shared",
      body: "权限治理 权限 限治 治理需要双人复核。",
      searchBody: "权限治理 权限 限治 治理 双人复核",
    });
    const library = serviceWithContent();
    const page = await library.search(contributor, { query: "权限治理", limit: 20 });
    const hit = page.items[0]!;

    expect(page.items).toHaveLength(1);
    expect(hit.score).toBeLessThan(0);
    expect(Math.abs(hit.score)).toBeLessThan(0.001);

    const ai: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<unknown> {
        this.calls += 1;
        return { response: JSON.stringify({
          claims: [{ text: "权限治理需要双人复核。", citationIds: [hit.citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };
    await expect(new CitedAnswerService(ai).answer(contributor, "权限治理", [hit]))
      .resolves.toMatchObject({
        answer: "权限治理需要双人复核。 [1]",
        citations: [hit.citationId],
        evidenceConfidence: 0.7,
      });
    expect(ai.calls).toBe(1);
  });

  it("keeps visible-evidence relevance invariant under unrelated corpus growth and padded input", async () => {
    await seedKnowledge({
      id: "knowledge-growth-strong",
      revisionId: "revision-growth-strong",
      title: "Launch latency review",
      visibility: "shared",
      body: "Launch latency was caused by a compressed test window.",
      searchBody: "launch latency compressed test window",
    });
    await seedKnowledge({
      id: "knowledge-growth-weak",
      revisionId: "revision-growth-weak",
      title: "General employee handbook",
      visibility: "shared",
      body: `launch ${"generic boilerplate policy ".repeat(400)}latency`,
      searchBody: `launch ${"generic boilerplate policy ".repeat(400)}latency`,
    });
    const library = serviceWithContent();
    const before = await library.search(contributor, { query: "   launch latency   ", limit: 20 });
    const strongBefore = before.items.find((hit) => hit.knowledgeItemId === "knowledge-growth-strong")!;
    const weakBefore = before.items.find((hit) => hit.knowledgeItemId === "knowledge-growth-weak")!;

    expect(strongBefore.score).toBeLessThan(0);
    expect(weakBefore.score).toBeLessThan(0);
    expect(weakBefore.excerpt).toMatch(/^…|…$/u);
    expect(["launch", "latency"].every((term) => (
      `${weakBefore.title}\n${weakBefore.excerpt}`.toLowerCase().includes(term)
    ))).toBe(false);

    const strongAi: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<unknown> {
        this.calls += 1;
        return { response: JSON.stringify({
          claims: [{ text: "The compressed test window caused launch latency.", citationIds: [strongBefore.citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };
    await expect(new CitedAnswerService(strongAi).answer(
      contributor,
      "   launch latency   ",
      [strongBefore],
    )).resolves.toMatchObject({ citations: [strongBefore.citationId] });
    expect(strongAi.calls).toBe(1);

    const weakAi: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<never> {
        this.calls += 1;
        throw new Error("weak evidence must not reach AI");
      },
    };
    const weakAnswers = new CitedAnswerService(weakAi);
    await expect(weakAnswers.answer(contributor, "   launch latency   ", [weakBefore]))
      .resolves.toEqual(citedRefusal(0.275));
    expect(weakAi.calls).toBe(0);

    for (let index = 0; index < 24; index += 1) {
      await seedKnowledge({
        id: `knowledge-growth-decoy-${index}`,
        revisionId: `revision-growth-decoy-${index}`,
        title: `Unrelated handbook ${index}`,
        visibility: "shared",
        body: "vacation policy directory contact details",
        searchBody: "vacation policy directory contact details",
      });
    }
    const after = await library.search(contributor, { query: "launch latency", limit: 20 });
    const strongAfter = after.items.find((hit) => hit.knowledgeItemId === "knowledge-growth-strong")!;
    const weakAfter = after.items.find((hit) => hit.knowledgeItemId === "knowledge-growth-weak")!;
    expect(strongAfter.score).not.toBe(strongBefore.score);
    expect(weakAfter.score).not.toBe(weakBefore.score);

    const grownStrongAi: CitedAnswerAi & { calls: number } = {
      calls: 0,
      async run(): Promise<unknown> {
        this.calls += 1;
        return { response: JSON.stringify({
          claims: [{ text: "The compressed test window caused launch latency.", citationIds: [strongAfter.citationId] }],
          insufficientEvidence: false,
        }) };
      },
    };
    await expect(new CitedAnswerService(grownStrongAi).answer(
      contributor,
      "launch latency",
      [strongAfter],
    )).resolves.toMatchObject({ citations: [strongAfter.citationId] });
    expect(grownStrongAi.calls).toBe(1);

    await expect(weakAnswers.answer(contributor, "launch latency", [weakAfter]))
      .resolves.toEqual(citedRefusal(0.275));
    expect(weakAi.calls).toBe(0);
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

  it("excludes upgrade-shaped degraded knowledge in a disabled Collection until bounded reindex", async () => {
    const spaces = new SpacesRepository(env.DB);
    await spaces.createCollection({
      id: "collection-degraded-disabled", spaceId: "default", parentId: null,
      name: "Disabled degraded", description: "", status: "disabled", position: 4,
      createdAt: now, updatedAt: now,
    });
    await seedKnowledge({
      id: "knowledge-disabled-degraded", revisionId: "revision-disabled-degraded",
      title: "Disabled degraded", visibility: "shared", searchStatus: "search_degraded",
      body: "disableddegradedterm", index: false,
    });
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE knowledge_items SET collection_id = 'collection-degraded-disabled' WHERE id = 'knowledge-disabled-degraded'",
      ),
      env.DB.prepare(
        `INSERT INTO jobs (
           id, kind, resource_id, state, attempts, available_at, last_error_code,
           created_at, updated_at, lease_token, lease_expires_at
         ) VALUES ('job-disabled-degraded', 'index_revision', 'revision-disabled-degraded',
           'failed_retryable', 1, ?, 'FTS_INDEX_FAILED', ?, ?, NULL, NULL)`,
      ).bind(now, now, now),
    ]);
    const service = serviceWithContent();

    await expect(service.search(contributor, { query: "disableddegradedterm" }))
      .resolves.toEqual({ items: [], degraded: false });

    await spaces.updateCollection("collection-degraded-disabled", {
      status: "active", updatedAt: "2026-08-22T00:01:00.000Z",
    });
    await expect(service.search(contributor, { query: "disableddegradedterm" }))
      .resolves.toEqual({ items: [], degraded: false });
    await expect(indexActivityState("knowledge-disabled-degraded")).resolves.toEqual({
      searchStatus: "pending", jobState: "pending", adminRows: 0, sharedRows: 0,
    });
    await expect(new PublicationRepository(env.DB).processIndexJob("revision-disabled-degraded"))
      .resolves.toBe("indexed");
    await expect(service.search(contributor, { query: "disableddegradedterm" }))
      .resolves.toMatchObject({
        degraded: false,
        items: [expect.objectContaining({ knowledgeItemId: "knowledge-disabled-degraded" })],
      });
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

    const invalidIds = ["x".repeat(129), "x\u0000y", "\ud800"];
    for (const id of invalidIds) {
      const listPayload = decodeOpaqueCursor(listCursor) as Record<string, unknown>;
      const searchPayload = decodeOpaqueCursor(searchCursor) as Record<string, unknown>;
      await expect(service.list(contributor, {
        spaceId: "default", limit: 1, cursor: encodeOpaqueCursor({ ...listPayload, id }),
      })).rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID", status: 400 });
      await expect(service.search(contributor, {
        query: "cursor", limit: 1,
        cursor: encodeOpaqueCursor({ ...searchPayload, knowledgeItemId: id }),
      })).rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID", status: 400 });
    }
  });

  it("uses both selective active corpora without relational scans at a 10,000-Revision production shape", async () => {
    await seedProductionSearchScale(10_000);
    const prepared: string[] = [];
    const database = capturePreparedSql(env.DB, prepared);
    const service = new LibraryService(new LibraryRepository(database), noContentReader);

    await expect(service.list(contributor, { spaceId: "space-empty", limit: 20 }))
      .resolves.toEqual({ items: [] });
    await expect(service.search(contributor, { query: "not-present", spaceId: "space-empty", limit: 20 }))
      .resolves.toEqual({ items: [], degraded: false });
    await service.list(contributor, { spaceId: "default", tagId: "tag-plan-a", limit: 20 });
    await service.search(contributor, {
      query: "planterm", spaceId: "default", collectionId: "collection-plan",
    });
    await service.search(contributor, {
      query: "planterm", spaceId: "default", tagId: "tag-plan-a",
    });
    await service.search(contributor, {
      query: "planterm", spaceId: "default", tagIds: ["tag-plan-a", "tag-plan-b"], tagMode: "and",
    });
    await service.search(contributor, {
      query: "planterm", spaceId: "default", tagIds: ["tag-plan-a", "tag-plan-b"], tagMode: "or",
    });
    const bounded = await service.search(contributor, { query: "planterm", spaceId: "default", limit: 50 });
    expect(bounded.items).toHaveLength(50);
    expect(bounded.nextCursor).toBeDefined();
    const boundedNext = await service.search(contributor, {
      query: "planterm", spaceId: "default", limit: 50, cursor: bounded.nextCursor,
    });
    expect(boundedNext.items).toHaveLength(50);
    expect(new Set([...bounded.items, ...boundedNext.items].map((item) => item.chunkId))).toHaveLength(100);
    await service.search(admin, { query: "planterm", spaceId: "default", limit: 50 });

    const listSql = prepared.find((sql) => sql.includes("ORDER BY k.updated_at DESC"));
    const taggedListSql = prepared.find((sql) => sql.includes("ORDER BY k.updated_at DESC")
      && sql.includes("JOIN tags active_tag"));
    const degradedSql = prepared.find((sql) => sql.includes("k.search_status = 'search_degraded'"));
    expect(listSql).toBeDefined();
    expect(taggedListSql).toBeDefined();
    expect(degradedSql).toBeDefined();
    const listPlan = await explain(listSql!, ["member-1", "contributor", "space-empty", 21]);
    const taggedListPlan = await explain(taggedListSql!, [
      "member-1", "contributor", "default", "tag-plan-a", 21,
    ]);
    const degradedPlan = await explain(degradedSql!, ["member-1", "contributor", "space-empty"]);
    expect(listPlan).toContain("knowledge_items_space_page");
    expect(taggedListPlan).toContain("sqlite_autoindex_revision_tags_1");
    expect(taggedListPlan).toContain("sqlite_autoindex_tags_1");
    expect(taggedListPlan).toContain("knowledge_items_space_page");
    expect(degradedPlan).toContain("knowledge_items_degraded_scope");
    const sharedSearchSql = prepared.filter((sql) => sql.includes("bm25(chunks_fts_shared"));
    const adminSearchSql = prepared.filter((sql) => sql.includes("bm25(chunks_fts,"));
    expect(sharedSearchSql).toHaveLength(7);
    expect(adminSearchSql).toHaveLength(1);
    const collectionPlan = await explain(sharedSearchSql[1]!, [
      "member-1", "contributor", "\"planterm\"", "default", "collection-plan", "collection-plan", 21,
    ]);
    const singleTagPlan = await explain(sharedSearchSql[2]!, [
      "member-1", "contributor", "\"planterm\"", "default", "tag-plan-a", 21,
    ]);
    const andPlan = await explain(sharedSearchSql[3]!, [
      "member-1", "contributor", "\"planterm\"", "default",
      "tag-plan-a", "tag-plan-b", "default", "tag-plan-a", "tag-plan-b", 21,
    ]);
    const orPlan = await explain(sharedSearchSql[4]!, [
      "member-1", "contributor", "\"planterm\"", "default",
      "tag-plan-a", "tag-plan-b", "default", "tag-plan-a", "tag-plan-b", 21,
    ]);
    const adminPlan = await explain(adminSearchSql[0]!, [
      "admin-1", "admin", "\"planterm\"", "default", 51,
    ]);
    expect(andPlan).toContain("sqlite_autoindex_revision_tags_1");
    expect(orPlan).toContain("sqlite_autoindex_revision_tags_1");
    expect(singleTagPlan).toContain("sqlite_autoindex_revision_tags_1");
    expect(andPlan).toContain("sqlite_autoindex_tags_1");
    expect(orPlan).toContain("sqlite_autoindex_tags_1");
    expect(singleTagPlan).toContain("sqlite_autoindex_tags_1");
    expect(collectionPlan).toContain("knowledge_items_collection_reindex");
    for (const plan of [collectionPlan, singleTagPlan, andPlan, orPlan]) {
      assertSelectiveSearchPlan(plan.split("\n"), "chunks_fts_shared");
      expect(plan).toMatch(/knowledge_items_(?:current_revision_index_status|collection_reindex)/u);
    }
    assertSelectiveSearchPlan(adminPlan.split("\n"), "chunks_fts");
    expect(adminPlan).toContain("knowledge_items_current_revision_index_status");
  });

  it("rejects full relational alias scans in search EXPLAIN plans", () => {
    const indexedPlan = [
      "SCAN chunks_fts_shared VIRTUAL TABLE INDEX 0:M6",
      "SEARCH c USING INTEGER PRIMARY KEY (rowid=?)",
      "SEARCH r USING INDEX sqlite_autoindex_revisions_1 (id=?)",
      "SEARCH k USING INDEX knowledge_items_current_revision_index_status (current_revision_id=?)",
      "SEARCH current_index_job USING INDEX sqlite_autoindex_jobs_2 (kind=? AND resource_id=?)",
      "SEARCH s USING INDEX sqlite_autoindex_spaces_1 (id=?)",
      "SEARCH active_collection USING INDEX sqlite_autoindex_collections_1 (id=?) LEFT-JOIN",
      "SEARCH members USING INDEX sqlite_autoindex_members_1 (id=?)",
      "USE TEMP B-TREE FOR ORDER BY",
    ];
    expect(() => assertSelectiveSearchPlan(indexedPlan, "chunks_fts_shared")).not.toThrow();

    for (const alias of ["k", "r", "c", "current_index_job", "s", "active_collection", "selected_tag"]) {
      const mutated = indexedPlan.map((detail) => detail.startsWith(`SEARCH ${alias} `)
        ? `SCAN ${alias}`
        : detail);
      if (!mutated.includes(`SCAN ${alias}`)) mutated.push(`SCAN ${alias}`);
      expect(() => assertSelectiveSearchPlan(mutated, "chunks_fts_shared"))
        .toThrow(`Unexpected relational scan: SCAN ${alias}`);
    }
  });

  it("lets only D1-authorized stored path/hash values reach the real published-content reader", async () => {
    const sharedMarkdown = "# Canonical shared\n\nAuthorized bytes.\n";
    const sharedHash = await sha256Hex(sharedMarkdown);
    const secretMarkdown = "# Canonical secret\n\nHidden bytes.\n";
    const secretHash = await sha256Hex(secretMarkdown);
    await seedKnowledge({
      id: "knowledge-real-shared",
      revisionId: "revision-real-shared",
      title: "Real shared",
      visibility: "shared",
      markdown: sharedMarkdown,
      body: "Authorized citation body",
      searchBody: "authorized citation body",
      contentSha256: sharedHash,
    });
    await seedKnowledge({
      id: "knowledge-real-secret",
      revisionId: "revision-real-secret",
      title: "Real secret",
      visibility: "admin_only",
      markdown: secretMarkdown,
      body: "Secret citation body",
      searchBody: "secret citation body",
      contentSha256: secretHash,
    });
    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName("library-security:default"));
    await commitCanonical(stub, {
      spaceId: "default",
      knowledgeItemId: "knowledge-real-shared",
      revisionId: "revision-real-shared",
      contentSha256: sharedHash,
      markdown: sharedMarkdown,
    });
    await commitCanonical(stub, {
      spaceId: "default",
      knowledgeItemId: "knowledge-real-secret",
      revisionId: "revision-real-secret",
      contentSha256: secretHash,
      markdown: secretMarkdown,
    });
    const workspace = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
    const realReader = createPublishedContentReader(workspace);
    const readerCalls: Array<[string, string]> = [];
    const reader: PublishedContentReader = {
      async read(path, hash) {
        readerCalls.push([path, hash]);
        return realReader.read(path, hash);
      },
    };
    const repository = new LibraryRepository(env.DB);
    const service = new LibraryService(repository, reader);
    const sharedCitation = encodeCitationId({
      revisionId: "revision-real-shared",
      chunkId: "revision-real-shared-chunk-0",
    });
    const secretCitation = encodeCitationId({
      revisionId: "revision-real-secret",
      chunkId: "revision-real-secret-chunk-0",
    });

    try {
      const detailWithUntrustedExtras = service.detail.bind(service) as unknown as (
        scope: LibraryScope,
        knowledgeItemId: string,
        untrustedPath: string,
        untrustedHash: string,
      ) => ReturnType<LibraryService["detail"]>;
      await expect(detailWithUntrustedExtras(
        contributor,
        "knowledge-real-shared",
        "/workspace/published/default/knowledge-real-secret/revision-real-secret.md",
        secretHash,
      )).resolves.toMatchObject({
        currentRevision: { markdown: sharedMarkdown },
      });
      await expect(service.readCitation(contributor, sharedCitation)).resolves.toMatchObject({
        body: "Authorized citation body",
      });
      await expect(service.download(
        contributor,
        "knowledge-real-shared",
        "revision-real-shared",
      )).resolves.toEqual({ markdown: sharedMarkdown, filename: "Real shared.md" });
      await expect(service.download(
        admin,
        "knowledge-real-secret",
        "revision-real-secret",
      )).resolves.toEqual({ markdown: secretMarkdown, filename: "Real secret.md" });
      expect(readerCalls).toEqual([
        ["/workspace/published/default/knowledge-real-shared/revision-real-shared.md", sharedHash],
        ["/workspace/published/default/knowledge-real-shared/revision-real-shared.md", sharedHash],
        ["/workspace/published/default/knowledge-real-secret/revision-real-secret.md", secretHash],
      ]);

      const forged: LibraryScope = { memberId: "member-1", role: "admin" };
      await expect(service.detail(disabled, "knowledge-real-shared")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.revision(disabled, "knowledge-real-shared", "revision-real-shared")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.search(disabled, { query: "authorized", limit: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.readCitation(disabled, sharedCitation)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.download(disabled, "knowledge-real-shared", "revision-real-shared"))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.detail(forged, "knowledge-real-secret")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.revision(forged, "knowledge-real-secret", "revision-real-secret")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.search(forged, { query: "secret", limit: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.readCitation(forged, secretCitation)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.download(forged, "knowledge-real-secret", "revision-real-secret"))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.detail(contributor, "knowledge-real-secret")).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.revision(contributor, "knowledge-real-secret", "revision-real-secret")).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.readCitation(contributor, secretCitation)).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.download(contributor, "knowledge-real-secret", "revision-real-secret"))
        .rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.download(contributor, "knowledge-real-shared", "revision-real-secret"))
        .rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.detail(contributor, "knowledge-invisible-id")).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.revision(contributor, "knowledge-invisible-id", "revision-invisible-id")).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.download(contributor, "knowledge-invisible-id", "revision-invisible-id"))
        .rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.readCitation(contributor, encodeCitationId({
        revisionId: "revision-invisible-id",
        chunkId: "revision-invisible-id-chunk-0",
      }))).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });

      await expect(repository.findCurrent(forged, "knowledge-real-secret")).resolves.toBeNull();
      await expect(repository.findCurrent(contributor, "knowledge-real-secret")).resolves.toBeNull();
      await expect(repository.findRevision(disabled, "knowledge-real-shared", "revision-real-shared")).resolves.toBeNull();
      await expect(repository.findRevision(contributor, "knowledge-real-secret", "revision-real-secret")).resolves.toBeNull();
      await expect(repository.findCitation(contributor, "revision-real-secret", "revision-real-secret-chunk-0")).resolves.toBeNull();
      await expect(repository.list(forged, { limit: 20, cursorKey: "a".repeat(64) })).resolves.toEqual({ items: [] });
      await expect(repository.search(forged, {
        normalizedQuery: "secret",
        matchQuery: "\"secret\"",
        terms: ["secret"],
        termKeys: ["SECRET"],
        policyVersion: 2,
        limit: 20,
        cursorKey: "a".repeat(64),
      })).resolves.toEqual({ items: [], degraded: false });
      expect(readerCalls).toHaveLength(3);

      await env.DB.prepare("UPDATE spaces SET status = 'disabled' WHERE id = 'default'").run();
      await expect(service.detail(contributor, "knowledge-real-shared")).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.revision(contributor, "knowledge-real-shared", "revision-real-shared")).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.search(contributor, { query: "authorized", limit: 20 })).resolves.toEqual({ items: [], degraded: false });
      await expect(service.readCitation(contributor, sharedCitation)).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      await expect(service.download(contributor, "knowledge-real-shared", "revision-real-shared"))
        .rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
      expect(readerCalls).toHaveLength(3);
    } finally {
      disposeWorkspace(workspace);
    }
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
    env.DB.prepare("INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at) VALUES ('space-empty', 'space-empty', 'Space Empty', '', 'shared', 'active', 3, 0, ?, ?)").bind(now, now),
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
  contentSha256?: string;
  summary?: string;
  searchTags?: string;
  indexField?: "body" | "code";
  tagIds?: string[];
  location?: SourceLocation;
}

async function seedKnowledge(input: SeedKnowledgeInput): Promise<void> {
  const spaceId = input.spaceId ?? "default";
  const markdown = input.markdown ?? `# ${input.title}\n\n${input.body ?? input.title}\n`;
  const body = input.body ?? input.title;
  const searchBody = input.searchBody ?? body.toLowerCase();
  const submissionId = `submission-${input.revisionId}`;
  const sourceId = `source-${input.revisionId}`;
  const sourceVersionId = `source-version-${input.revisionId}`;
  const contentSha256 = input.contentSha256 ?? hashFor(input.revisionId);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, idempotency_key, created_at, updated_at) VALUES (?, 'member-1', ?, NULL, 'markdown', 'published', ?, ?, NULL, ?, ?)",
    ).bind(submissionId, spaceId, input.title, markdown, now, now),
    env.DB.prepare(
      "INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES (?, 'member-1', ?, NULL, 'markdown', ?, ?, ?)",
    ).bind(sourceId, spaceId, input.title, now, now),
    env.DB.prepare(
      "INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES (?, ?, ?, 1, ?, ?, 'm1-v1', ?)",
    ).bind(sourceVersionId, sourceId, submissionId, markdown, contentSha256, now),
    env.DB.prepare(
      "INSERT INTO knowledge_items (id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?)",
    ).bind(input.id, spaceId, input.status ?? "active", input.searchStatus ?? "indexed", now, now),
    env.DB.prepare(
      "INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, summary, tags_json, visibility, published_by, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin-1', ?)",
    ).bind(input.revisionId, input.id, sourceVersionId, `/workspace/published/${spaceId}/${input.id}/${input.revisionId}.md`, contentSha256, input.title, input.summary ?? "", JSON.stringify(input.tagIds ?? []), input.visibility, now),
    env.DB.prepare("UPDATE knowledge_items SET current_revision_id = ? WHERE id = ?").bind(input.revisionId, input.id),
    env.DB.prepare(
      "INSERT INTO chunks (id, revision_id, ordinal, heading_path, start_line, end_line, body, search_title, search_tags, search_body, index_field, location_json) VALUES (?, ?, 0, '[\"Section\"]', 3, 3, ?, ?, ?, ?, ?, ?)",
    ).bind(`${input.revisionId}-chunk-0`, input.revisionId, body, input.title, input.searchTags ?? "", searchBody, input.indexField ?? "body", JSON.stringify(input.location ?? {})),
    ...((input.tagIds ?? []).map((tagId) => env.DB.prepare(
      "INSERT INTO revision_tags (revision_id, tag_id) VALUES (?, ?)",
    ).bind(input.revisionId, tagId))),
    ...(input.searchStatus === "search_degraded" ? [] : [env.DB.prepare(
      "INSERT INTO jobs (id, kind, resource_id, state, attempts, available_at, created_at, updated_at) VALUES (?, 'index_revision', ?, 'completed', 1, ?, ?, ?)",
    ).bind(`job-${input.revisionId}`, input.revisionId, now, now, now)]),
    ...(input.index === false ? [] : [env.DB.prepare(
      `INSERT INTO chunks_fts (rowid, chunk_id, title, summary, tags, body, code)
       SELECT rowid, id, ?, ?, ?,
         CASE WHEN index_field = 'body' THEN ? ELSE '' END,
         CASE WHEN index_field = 'code' THEN ? ELSE '' END
       FROM chunks WHERE id = ?`,
    ).bind(input.title, input.summary ?? "", input.searchTags ?? "", searchBody, searchBody, `${input.revisionId}-chunk-0`)]),
    ...(input.index === false || input.visibility !== "shared" ? [] : [env.DB.prepare(
      `INSERT INTO chunks_fts_shared (rowid, chunk_id, title, summary, tags, body, code)
       SELECT rowid, id, ?, ?, ?,
         CASE WHEN index_field = 'body' THEN ? ELSE '' END,
         CASE WHEN index_field = 'code' THEN ? ELSE '' END
       FROM chunks WHERE id = ?`,
    ).bind(input.title, input.summary ?? "", input.searchTags ?? "", searchBody, searchBody, `${input.revisionId}-chunk-0`)]),
  ]);
}

async function seedTag(id: string, spaceId: string, status: "active" | "disabled"): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO tags (id, space_id, slug, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, spaceId, id, id, status, now, now).run();
}

async function seedProductionSearchScale(count: number): Promise<void> {
  if (!Number.isSafeInteger(count) || count < 1 || count > 10_000) throw new Error("invalid scale count");
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at) VALUES ('collection-plan', 'default', NULL, 'Plan', '', 'active', 10, ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at) VALUES ('collection-scale-disabled', 'default', NULL, 'Disabled scale', '', 'disabled', 11, ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT INTO tags (id, space_id, slug, name, status, created_at, updated_at) VALUES ('tag-plan-a', 'default', 'tag-plan-a', 'Plan A', 'active', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT INTO tags (id, space_id, slug, name, status, created_at, updated_at) VALUES ('tag-plan-b', 'default', 'tag-plan-b', 'Plan B', 'active', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT INTO tags (id, space_id, slug, name, status, created_at, updated_at) VALUES ('tag-plan-disabled', 'default', 'staletagterm', 'Stale Tag Term', 'disabled', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < ?
       )
       INSERT INTO submissions (
         id, submitter_id, requested_space_id, requested_collection_id, kind, status,
         title, content, idempotency_key, created_at, updated_at
       )
       SELECT printf('scale-submission-%05d', value), 'member-1',
         CASE WHEN value % 7 = 0 THEN 'space-two' ELSE 'default' END,
         CASE WHEN value % 7 = 0 THEN NULL
           WHEN value % 17 = 0 THEN 'collection-scale-disabled'
           WHEN value % 3 = 0 THEN 'collection-plan' ELSE NULL END,
         'markdown', 'published', printf('Scale %05d', value),
         printf('# Scale %05d\n\nplanterm evidence %05d\n', value, value), NULL, ?, ?
       FROM sequence`,
    ).bind(count, now, now),
    env.DB.prepare(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < ?
       )
       INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at)
       SELECT printf('scale-source-%05d', value), 'member-1',
         CASE WHEN value % 7 = 0 THEN 'space-two' ELSE 'default' END,
         CASE WHEN value % 7 = 0 THEN NULL
           WHEN value % 17 = 0 THEN 'collection-scale-disabled'
           WHEN value % 3 = 0 THEN 'collection-plan' ELSE NULL END,
         'markdown', printf('Scale %05d', value), ?, ? FROM sequence`,
    ).bind(count, now, now),
    env.DB.prepare(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < ?
       )
       INSERT INTO source_versions (
         id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at
       )
       SELECT printf('scale-version-%05d', value), printf('scale-source-%05d', value),
         printf('scale-submission-%05d', value), 1, printf('planterm evidence %05d', value),
         printf('%064d', value), 'm1-v1', ? FROM sequence`,
    ).bind(count, now),
    env.DB.prepare(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < ?
       )
       INSERT INTO knowledge_items (
         id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at
       )
       SELECT printf('scale-item-%05d', value),
         CASE WHEN value % 7 = 0 THEN 'space-two' ELSE 'default' END,
         CASE WHEN value % 7 = 0 THEN NULL
           WHEN value % 17 = 0 THEN 'collection-scale-disabled'
           WHEN value % 3 = 0 THEN 'collection-plan' ELSE NULL END,
         NULL, CASE WHEN value % 19 = 0 THEN 'trashed' ELSE 'active' END,
         CASE WHEN value % 23 = 0 THEN 'pending' ELSE 'indexed' END, ?, ? FROM sequence`,
    ).bind(count, now, now),
    env.DB.prepare(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < ?
       )
       INSERT INTO revisions (
         id, knowledge_item_id, source_version_id, normalized_path, content_sha256,
         title, summary, tags_json, visibility, published_by, published_at
       )
       SELECT printf('scale-revision-%05d', value), printf('scale-item-%05d', value),
         printf('scale-version-%05d', value), printf('/scale/%05d.md', value), printf('%064d', value),
         printf('Scale %05d', value), 'production shaped scale evidence',
         CASE WHEN value % 6 = 0 THEN '["tag-plan-a","tag-plan-b"]'
           WHEN value % 2 = 0 THEN '["tag-plan-a"]'
           WHEN value % 3 = 0 THEN '["tag-plan-b"]' ELSE '[]' END,
         CASE WHEN value % 10 = 0 THEN 'admin_only' ELSE 'shared' END,
         'admin-1', ? FROM sequence`,
    ).bind(count, now),
    env.DB.prepare(
      `UPDATE knowledge_items SET current_revision_id =
         'scale-revision-' || substr(id, length('scale-item-') + 1)
       WHERE id LIKE 'scale-item-%'`,
    ),
    env.DB.prepare(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < ?
       )
       INSERT INTO chunks (
         id, revision_id, ordinal, heading_path, start_line, end_line, body,
         search_title, search_tags, search_body, index_field
       )
       SELECT printf('scale-chunk-%05d', value), printf('scale-revision-%05d', value), 0,
         '["Scale"]', 3, 3, printf('planterm evidence %05d', value), printf('Scale %05d', value),
         CASE WHEN value % 5 = 0 THEN 'staletagterm' ELSE '' END,
         printf('planterm evidence %05d', value), CASE WHEN value % 11 = 0 THEN 'code' ELSE 'body' END
       FROM sequence`,
    ).bind(count),
    env.DB.prepare(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < ?
       )
       INSERT INTO jobs (
         id, kind, resource_id, state, attempts, available_at, last_error_code, created_at, updated_at
       )
       SELECT printf('scale-job-%05d', value), 'index_revision', printf('scale-revision-%05d', value),
         CASE WHEN value % 23 = 0 THEN 'pending' ELSE 'completed' END,
         CASE WHEN value % 23 = 0 THEN 0 ELSE 1 END, ?, NULL, ?, ? FROM sequence`,
    ).bind(count, now, now, now),
    env.DB.prepare(
      `INSERT INTO revision_tags (revision_id, tag_id)
       SELECT id, 'tag-plan-a' FROM revisions
       WHERE id LIKE 'scale-revision-%' AND CAST(substr(id, -5) AS INTEGER) % 2 = 0`,
    ),
    env.DB.prepare(
      `INSERT INTO revision_tags (revision_id, tag_id)
       SELECT id, 'tag-plan-b' FROM revisions
       WHERE id LIKE 'scale-revision-%' AND CAST(substr(id, -5) AS INTEGER) % 3 = 0`,
    ),
    env.DB.prepare(
      `INSERT INTO revision_tags (revision_id, tag_id)
       SELECT id, 'tag-plan-disabled' FROM revisions
       WHERE id LIKE 'scale-revision-%' AND CAST(substr(id, -5) AS INTEGER) % 5 = 0`,
    ),
  ]);
  const activeRows = `FROM chunks c
    JOIN revisions r ON r.id = c.revision_id
    JOIN knowledge_items k ON k.current_revision_id = r.id
    JOIN jobs j ON j.kind = 'index_revision' AND j.resource_id = r.id AND j.state = 'completed'
    JOIN spaces s ON s.id = k.space_id AND s.status = 'active' AND s.kind != 'legacy'
    LEFT JOIN collections collection_state ON collection_state.id = k.collection_id
      AND collection_state.space_id = k.space_id AND collection_state.status = 'active'
    WHERE c.id LIKE 'scale-chunk-%' AND k.status = 'active' AND k.search_status = 'indexed'
      AND (k.collection_id IS NULL OR collection_state.id IS NOT NULL)`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO chunks_fts (rowid, chunk_id, title, summary, tags, body, code)
       SELECT c.rowid, c.id, r.title, r.summary,
         trim(CASE WHEN CAST(substr(r.id, -5) AS INTEGER) % 2 = 0 THEN 'tag-plan-a Plan A ' ELSE '' END
           || CASE WHEN CAST(substr(r.id, -5) AS INTEGER) % 3 = 0 THEN 'tag-plan-b Plan B' ELSE '' END),
         CASE WHEN c.index_field = 'body' THEN c.search_body ELSE '' END,
         CASE WHEN c.index_field = 'code' THEN c.search_body ELSE '' END ${activeRows}`,
    ),
    env.DB.prepare(
      `INSERT INTO chunks_fts_shared (rowid, chunk_id, title, summary, tags, body, code)
       SELECT c.rowid, c.id, r.title, r.summary,
         trim(CASE WHEN CAST(substr(r.id, -5) AS INTEGER) % 2 = 0 THEN 'tag-plan-a Plan A ' ELSE '' END
           || CASE WHEN CAST(substr(r.id, -5) AS INTEGER) % 3 = 0 THEN 'tag-plan-b Plan B' ELSE '' END),
         CASE WHEN c.index_field = 'body' THEN c.search_body ELSE '' END,
         CASE WHEN c.index_field = 'code' THEN c.search_body ELSE '' END ${activeRows}
       AND r.visibility = 'shared'`,
    ),
  ]);
}

async function indexActivityState(knowledgeItemId: string): Promise<{
  searchStatus: string;
  jobState: string;
  adminRows: number;
  sharedRows: number;
}> {
  const state = await env.DB.prepare(
    `SELECT k.search_status, j.state AS job_state
     FROM knowledge_items k JOIN jobs j
       ON j.kind = 'index_revision' AND j.resource_id = k.current_revision_id
     WHERE k.id = ? LIMIT 1`,
  ).bind(knowledgeItemId).first<{ search_status: string; job_state: string }>();
  if (!state) throw new Error("missing index activity state");
  const [admin, shared] = await Promise.all([
    env.DB.prepare(
      `SELECT count(*) AS count FROM chunks_fts
       WHERE chunk_id IN (
         SELECT c.id FROM chunks c JOIN revisions r ON r.id = c.revision_id
         WHERE r.knowledge_item_id = ?
       )`,
    ).bind(knowledgeItemId).first<{ count: number }>(),
    env.DB.prepare(
      `SELECT count(*) AS count FROM chunks_fts_shared
       WHERE chunk_id IN (
         SELECT c.id FROM chunks c JOIN revisions r ON r.id = c.revision_id
         WHERE r.knowledge_item_id = ?
       )`,
    ).bind(knowledgeItemId).first<{ count: number }>(),
  ]);
  return {
    searchStatus: state.search_status,
    jobState: state.job_state,
    adminRows: admin?.count ?? -1,
    sharedRows: shared?.count ?? -1,
  };
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
    ...(input.index === false || input.visibility !== "shared" ? [] : [env.DB.prepare(
      `INSERT INTO chunks_fts_shared (rowid, chunk_id, title, summary, tags, body, code)
       SELECT rowid, id, ?, '', '', search_body, '' FROM chunks WHERE id = ?`,
    ).bind(input.title, `${input.revisionId}-chunk-0`)]),
  ]);
}

function hashFor(value: string): string {
  return value.padEnd(64, "0").slice(0, 64).replace(/[^a-f0-9]/g, "a");
}

const noContentReader: PublishedContentReader = {
  async read() { throw new Error("content reader must not be called"); },
};

function capturePreparedSql(db: D1Database, prepared: string[]): D1Database {
  return new Proxy(db, {
    get(target, property) {
      if (property === "prepare") {
        return (query: string) => {
          prepared.push(query);
          return db.prepare(query);
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

async function explain(sql: string, bindings: unknown[]): Promise<string> {
  const rows = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .bind(...bindings).all<{ detail: string }>();
  return rows.results.map(({ detail }) => detail).join("\n");
}

function assertSelectiveSearchPlan(details: readonly string[], corpus: "chunks_fts" | "chunks_fts_shared"): void {
  const expectedFtsScan = `SCAN ${corpus} VIRTUAL TABLE INDEX`;
  const ftsScans = details.filter((detail) => detail.startsWith(expectedFtsScan));
  if (ftsScans.length !== 1) throw new Error("Expected exactly one FTS MATCH scan");
  for (const detail of details) {
    if (detail.startsWith("SCAN ")
      && !detail.startsWith(expectedFtsScan)
      && detail !== "SCAN CONSTANT ROW"
      && detail !== "SCAN requested_tag") {
      throw new Error(`Unexpected relational scan: ${detail}`);
    }
    if (detail.startsWith("USE TEMP B-TREE") && detail !== "USE TEMP B-TREE FOR ORDER BY") {
      throw new Error(`Unexpected temporary plan: ${detail}`);
    }
  }
  for (const alias of ["c", "r", "k", "current_index_job", "s", "active_collection", "members"]) {
    if (!details.some((detail) => detail.startsWith(`SEARCH ${alias} USING `))) {
      throw new Error(`Missing selective lookup: ${alias}`);
    }
  }
  if (!details.includes("USE TEMP B-TREE FOR ORDER BY")) throw new Error("Missing approved BM25 sort");
}

async function rejectedAppError(promise: Promise<unknown>): Promise<{
  code: string;
  message: string;
  status: number;
}> {
  try {
    await promise;
    throw new Error("expected rejection");
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return { code: error.code, message: error.message, status: error.status };
  }
}

function citedRefusal(evidenceConfidence: number) {
  return {
    answer: "知识库中没有足够依据回答这个问题。",
    citations: [],
    sources: [],
    evidenceConfidence,
    messageKey: "KNOWLEDGE_EVIDENCE_INSUFFICIENT",
    suggestedActionKeys: [
      "KNOWLEDGE_CHAT_REWRITE_QUESTION",
      "KNOWLEDGE_CHAT_EXPAND_SCOPE",
    ],
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function commitCanonical(
  stub: DurableObjectStub<KnowledgeBase>,
  input: Parameters<KnowledgeBase["commitPublishedContent"]>[0],
): Promise<PublishedContentReceipt> {
  const result = await stub.commitPublishedContent(input) as RpcResult<PublishedContentReceipt>;
  if (result.ok) return result.value;
  throw new AppError(result.error.code, result.error.message, result.error.status, result.error.retryable);
}

function disposeWorkspace(workspace: WorkspaceClient): void {
  const disposeSymbol = (Symbol as typeof Symbol & { dispose?: symbol }).dispose;
  const disposable = workspace as unknown as Record<symbol, unknown>;
  const dispose = disposeSymbol ? disposable[disposeSymbol] : undefined;
  if (typeof dispose === "function") dispose.call(workspace);
}

const now = "2026-08-22T00:00:00.000Z";
