/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, evictDurableObject, reset, runInDurableObject } from "cloudflare:test";
import { getWorkspace, type WorkspaceClient } from "@cloudflare/computer";
import { beforeEach, describe, expect, it } from "vitest";
import { APP_CONFIG } from "../../src/config";
import { AppError } from "../../src/http";
import type { KnowledgeBase } from "../../src/index";
import { createPublishedContentReader } from "../../src/knowledge/published-content";
import type { PublishedContentReceipt, RpcResult } from "../../src/knowledge/types";
import { PublicationRepository } from "../../src/publication/repository";
import { PublicationService } from "../../src/publication/service";
import type { PublicationReviewer, PublishSubmissionInput } from "../../src/publication/types";
import { chunkDocument } from "../../src/sources/chunker";
import { parseSource } from "../../src/sources/parser";
import { TagsRepository } from "../../src/tags/repository";
import { TagsService } from "../../src/tags/service";
import { MIGRATIONS } from "../fixtures/d1";

describe("M1 published content Durable Object", () => {
  beforeEach(async () => {
    await reset();
  });

  it("commits idempotently and persists exact bytes across Durable Object recreation", async () => {
    const markdown = "# Trusted knowledge\n\nDurable published bytes.\n";
    const parsed = await parseSource({ kind: "markdown", content: markdown });
    const input = {
      spaceId: "default",
      knowledgeItemId: "knowledge-1",
      revisionId: "revision-1",
      contentSha256: parsed.contentSha256,
      markdown: parsed.normalizedMarkdown,
    };
    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName("published-persistence"));

    const first = await stub.commitPublishedContent(input);
    const second = await stub.commitPublishedContent(input);
    expect(second).toEqual(first);
    expect(first).toEqual({
      ok: true,
      value: {
        path: "/workspace/published/default/knowledge-1/revision-1.md",
        contentSha256: parsed.contentSha256,
        bytes: new TextEncoder().encode(parsed.normalizedMarkdown).byteLength,
      },
    });

    await evictDurableObject(stub);
    const afterRecreation = await runInDurableObject(
      stub,
      (instance) => (instance as KnowledgeBase).commitPublishedContent(input),
    );
    expect(afterRecreation).toEqual(first);

    const workspace = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
    try {
      const receipt = first.ok ? first.value : undefined;
      expect(receipt).toBeDefined();
      const content = await createPublishedContentReader(workspace).read(receipt!.path, receipt!.contentSha256);
      expect(content).toBe(parsed.normalizedMarkdown);
      expect(await sha256Hex(content)).toBe(parsed.contentSha256);
    } finally {
      disposeWorkspace(workspace);
    }
  });

  it("returns the same receipt for simultaneous same-byte commits", async () => {
    const markdown = `${"same concurrent bytes ".repeat(4_000)}\n`;
    const contentSha256 = await sha256Hex(markdown);
    const input = {
      spaceId: "default",
      knowledgeItemId: "knowledge-concurrent-same",
      revisionId: "revision-1",
      contentSha256,
      markdown,
    };
    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName("published-concurrent-same"));

    const [first, second] = await Promise.all([
      stub.commitPublishedContent(input),
      stub.commitPublishedContent(input),
    ]);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true, value: { contentSha256 } });
  });

  it("allows only one winner for simultaneous different-byte commits to one revision path", async () => {
    const firstMarkdown = `${"first concurrent bytes ".repeat(4_000)}\n`;
    const secondMarkdown = `${"second concurrent bytes ".repeat(4_000)}\n`;
    const path = "/workspace/published/default/knowledge-concurrent-different/revision-1.md";
    const firstInput = {
      spaceId: "default",
      knowledgeItemId: "knowledge-concurrent-different",
      revisionId: "revision-1",
      contentSha256: await sha256Hex(firstMarkdown),
      markdown: firstMarkdown,
    };
    const secondInput = {
      ...firstInput,
      contentSha256: await sha256Hex(secondMarkdown),
      markdown: secondMarkdown,
    };
    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName("published-concurrent-different"));

    const results = await Promise.all([
      stub.commitPublishedContent(firstInput),
      stub.commitPublishedContent(secondInput),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      {
        ok: false,
        error: {
          code: "PUBLISHED_CONTENT_CONFLICT",
          message: "Published content already exists with different bytes",
          status: 409,
          retryable: false,
        },
      },
    ]);
    const winner = results.find((result) => result.ok);
    expect(winner?.value.path).toBe(path);

    const workspace = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
    try {
      const stored = await workspace.fs.readFile(path, "utf8");
      expect(await sha256Hex(stored)).toBe(winner?.value.contentSha256);
    } finally {
      disposeWorkspace(workspace);
    }
  });

  it("returns serializable validation and immutable-content conflicts without replacing first bytes", async () => {
    const firstMarkdown = "first published bytes\n";
    const firstHash = await sha256Hex(firstMarkdown);
    const base = {
      spaceId: "default",
      knowledgeItemId: "knowledge-conflict",
      revisionId: "revision-1",
      contentSha256: firstHash,
      markdown: firstMarkdown,
    };
    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName("published-validation"));

    for (const invalid of [
      { ...base, spaceId: "../default" },
      { ...base, knowledgeItemId: "knowledge/other" },
      { ...base, revisionId: "." },
      { ...base, contentSha256: "0".repeat(64) },
    ]) {
      const result = await stub.commitPublishedContent(invalid);
      expect(result).toMatchObject({ ok: false, error: { status: 400, retryable: false } });
    }

    const over = "x".repeat(APP_CONFIG.maxPublishedContentBytes + 1);
    await expect(stub.commitPublishedContent({ ...base, markdown: over, contentSha256: await sha256Hex(over) }))
      .resolves.toMatchObject({
        ok: false,
        error: { code: "PUBLISHED_CONTENT_TOO_LARGE", status: 413, retryable: false },
      });

    const beforeWrite = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
    try {
      expect((await beforeWrite.fs.readdir("/")).map((entry) => entry.name)).not.toContain("workspace");
    } finally {
      disposeWorkspace(beforeWrite);
    }

    await expect(stub.commitPublishedContent(base)).resolves.toMatchObject({ ok: true });
    const differentMarkdown = "different published bytes\n";
    await expect(stub.commitPublishedContent({
      ...base,
      markdown: differentMarkdown,
      contentSha256: await sha256Hex(differentMarkdown),
    })).resolves.toEqual({
      ok: false,
      error: {
        code: "PUBLISHED_CONTENT_CONFLICT",
        message: "Published content already exists with different bytes",
        status: 409,
        retryable: false,
      },
    });

    const workspace = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
    try {
      await expect(workspace.fs.readFile(
        "/workspace/published/default/knowledge-conflict/revision-1.md",
        "utf8",
      )).resolves.toBe(firstMarkdown);
    } finally {
      disposeWorkspace(workspace);
    }
  });

  it("fails a request-scoped read closed when stored bytes no longer match the authorized hash", async () => {
    const markdown = "published integrity\n";
    const contentSha256 = await sha256Hex(markdown);
    const path = "/workspace/published/default/knowledge-corruption/revision-1.md";
    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName("published-corruption"));
    await expect(stub.commitPublishedContent({
      spaceId: "default",
      knowledgeItemId: "knowledge-corruption",
      revisionId: "revision-1",
      contentSha256,
      markdown,
    })).resolves.toMatchObject({ ok: true });

    const workspace = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
    try {
      await workspace.fs.writeFile(path, "tampered integrity\n");
      const reader = createPublishedContentReader(workspace);
      await expect(reader.read(path, contentSha256)).rejects.toMatchObject({
        code: "PUBLISHED_CONTENT_CORRUPT",
        message: "Published content failed its integrity check",
        status: 500,
        retryable: false,
      });
    } finally {
      disposeWorkspace(workspace);
    }
  });
});

describe("M1 publication control plane", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await seedPublicationPrincipals();
    await seedPublicationTargets();
  });

  it("publishes once through D1 intent, immutable DO content, one D1 finalize batch, and indexing", async () => {
    const source = await seedReviewPendingSubmission("submission-1");
    const repository = repositoryWithIds("knowledge-1", "revision-1");
    const service = new PublicationService(repository, durableContentCommitter());

    const published = await service.publish(adminReviewer, "submission-1", publicationInput);

    expect(published).toMatchObject({
      id: "revision-1",
      knowledgeItemId: "knowledge-1",
      sourceVersionId: "source-version-submission-1",
      normalizedPath: "/workspace/published/default/knowledge-1/revision-1.md",
      contentSha256: source.contentSha256,
      title: "Reviewed title",
      tagIds: ["tag-a", "tag-b"],
      visibility: "shared",
      publishedBy: "admin-1",
      searchStatus: "indexed",
    });
    await expect(publicationState("submission-1")).resolves.toEqual({
      submissionStatus: "published",
      intentState: "completed",
      currentRevisionId: "revision-1",
      searchStatus: "indexed",
      jobState: "completed",
      jobAttempts: 1,
      revisionCount: 1,
      reviewCount: 1,
      chunkCount: 2,
      ftsCount: 2,
      auditCount: 1,
    });
    await expect(env.DB.prepare(
      "SELECT action, metadata FROM audit_events WHERE action = 'knowledge.published'",
    ).first()).resolves.toEqual({
      action: "knowledge.published",
      metadata: JSON.stringify({ submissionId: "submission-1", revisionId: "revision-1", visibility: "shared" }),
    });
    await expect(env.DB.prepare(
      "SELECT count(*) AS count FROM chunks_fts WHERE chunks_fts MATCH 'governance'",
    ).first()).resolves.toEqual({ count: 2 });

    const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName("publication:default"));
    const workspace = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0]);
    try {
      await expect(createPublishedContentReader(workspace).read(published.normalizedPath, published.contentSha256))
        .resolves.toBe(source.normalizedMarkdown);
    } finally {
      disposeWorkspace(workspace);
    }
  });

  it("converges concurrent publishers on one intent, revision, current pointer, FTS set, and audit", async () => {
    await seedReviewPendingSubmission("submission-concurrent");
    const first = new PublicationService(
      repositoryWithIds("knowledge-first", "revision-first"),
      durableContentCommitter(),
    );
    const second = new PublicationService(
      repositoryWithIds("knowledge-second", "revision-second"),
      durableContentCommitter(),
    );

    const results = await Promise.all([
      first.publish(adminReviewer, "submission-concurrent", publicationInput),
      second.publish(adminReviewer, "submission-concurrent", publicationInput),
    ]);

    expect(results[0]).toEqual(results[1]);
    await expect(publicationState("submission-concurrent")).resolves.toMatchObject({
      submissionStatus: "published",
      intentState: "completed",
      currentRevisionId: results[0].id,
      searchStatus: "indexed",
      jobState: "completed",
      revisionCount: 1,
      reviewCount: 1,
      chunkCount: 2,
      ftsCount: 2,
      auditCount: 1,
    });
  });

  it("rolls back every finalization row on a dependent audit failure and recovers the content-written intent", async () => {
    await seedReviewPendingSubmission("submission-rollback");
    const repository = repositoryWithIds("knowledge-rollback", "revision-rollback");
    const service = new PublicationService(repository, durableContentCommitter());
    await env.DB.prepare(
      "INSERT INTO audit_events (id, actor_kind, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, 'system', NULL, 'member.login', 'member', NULL, '{}', ?)",
    ).bind("publish-revision-rollback", now).run();

    await expect(service.publish(adminReviewer, "submission-rollback", publicationInput)).rejects.toThrow();
    await expect(publicationState("submission-rollback")).resolves.toMatchObject({
      submissionStatus: "review_pending",
      intentState: "content_written",
      currentRevisionId: null,
      revisionCount: 0,
      reviewCount: 0,
      chunkCount: 0,
      auditCount: 0,
    });

    await env.DB.prepare("DELETE FROM audit_events WHERE id = ?").bind("publish-revision-rollback").run();
    const recreated = new PublicationService(new PublicationRepository(env.DB), durableContentCommitter());
    await expect(recreated.recoverPending(20)).resolves.toEqual({
      recoveredIntents: 1,
      recoveredIndexJobs: 0,
      failures: [],
    });
    await expect(publicationState("submission-rollback")).resolves.toMatchObject({
      submissionStatus: "published",
      intentState: "completed",
      currentRevisionId: "revision-rollback",
      revisionCount: 1,
      reviewCount: 1,
      chunkCount: 2,
      ftsCount: 2,
      auditCount: 1,
    });
  });

  it("keeps the revision readable when FTS fails, records only a safe code, and later replays the same job", async () => {
    const source = await seedReviewPendingSubmission("submission-degraded");
    const service = new PublicationService(
      repositoryWithIds("knowledge-degraded", "revision-degraded"),
      durableContentCommitter(),
    );
    await env.DB.prepare("DROP TABLE chunks_fts").run();

    const degraded = await service.publish(adminReviewer, "submission-degraded", publicationInput);
    expect(degraded.searchStatus).toBe("search_degraded");
    await expect(env.DB.prepare(
      "SELECT k.search_status, j.state, j.last_error_code FROM knowledge_items k JOIN jobs j ON j.resource_id = k.current_revision_id WHERE k.id = ?",
    ).bind("knowledge-degraded").first()).resolves.toEqual({
      search_status: "search_degraded",
      state: "failed_retryable",
      last_error_code: "FTS_INDEX_FAILED",
    });
    const revision = await env.DB.prepare(
      "SELECT normalized_path, content_sha256 FROM revisions WHERE id = ?",
    ).bind("revision-degraded").first<{ normalized_path: string; content_sha256: string }>();
    expect(revision).toEqual({ normalized_path: degraded.normalizedPath, content_sha256: source.contentSha256 });

    await env.DB.prepare("CREATE VIRTUAL TABLE chunks_fts USING fts5(chunk_id UNINDEXED, title, tags, body, tokenize='unicode61 remove_diacritics 2')").run();
    const recreated = new PublicationService(new PublicationRepository(env.DB), durableContentCommitter());
    await expect(recreated.recoverPending(20)).resolves.toEqual({
      recoveredIntents: 0,
      recoveredIndexJobs: 1,
      failures: [],
    });
    await expect(publicationState("submission-degraded")).resolves.toMatchObject({
      currentRevisionId: "revision-degraded",
      searchStatus: "indexed",
      jobState: "completed",
      revisionCount: 1,
      ftsCount: 2,
      auditCount: 1,
    });
  });

  it("recreates services to recover pending-content, pending-index, and running-index boundaries exactly once", async () => {
    await seedReviewPendingSubmission("submission-pending-content");
    await seedReviewPendingSubmission("submission-pending-index");
    await seedReviewPendingSubmission("submission-running-index");

    const pendingContentRepository = repositoryWithIds("knowledge-pending-content", "revision-pending-content");
    await pendingContentRepository.createOrReadIntent(
      "submission-pending-content", adminReviewer.id, { ...publicationInput, tagIds: ["tag-a", "tag-b"] },
    );

    const pendingIndexRepository = repositoryWithIds("knowledge-pending-index", "revision-pending-index");
    await finalizeWithoutIndex(pendingIndexRepository, "submission-pending-index");

    const runningIndexRepository = repositoryWithIds("knowledge-running-index", "revision-running-index");
    await finalizeWithoutIndex(runningIndexRepository, "submission-running-index");
    await env.DB.prepare(
      "UPDATE jobs SET state = 'running' WHERE kind = 'index_revision' AND resource_id = 'revision-running-index'",
    ).run();

    const recreated = new PublicationService(new PublicationRepository(env.DB), durableContentCommitter());
    await expect(recreated.recoverPending(20)).resolves.toEqual({
      recoveredIntents: 1,
      recoveredIndexJobs: 2,
      failures: [],
    });
    await expect(recreated.recoverPending(20)).resolves.toEqual({
      recoveredIntents: 0,
      recoveredIndexJobs: 0,
      failures: [],
    });
    for (const submissionId of ["submission-pending-content", "submission-pending-index", "submission-running-index"]) {
      await expect(publicationState(submissionId)).resolves.toMatchObject({
        submissionStatus: "published",
        intentState: "completed",
        searchStatus: "indexed",
        jobState: "completed",
        revisionCount: 1,
        reviewCount: 1,
        chunkCount: 2,
        ftsCount: 2,
        auditCount: 1,
      });
    }
  });

  it("fails the finalize batch in D1 when a target changes after content persistence", async () => {
    await seedReviewPendingSubmission("submission-target-race");
    const repository = repositoryWithIds("knowledge-target-race", "revision-target-race");
    const intent = await repository.createOrReadIntent(
      "submission-target-race", adminReviewer.id, { ...publicationInput, tagIds: ["tag-a", "tag-b"] },
    );
    const receipt = await durableContentCommitter().commit({
      spaceId: intent.spaceId,
      knowledgeItemId: intent.knowledgeItemId,
      revisionId: intent.revisionId,
      contentSha256: intent.contentSha256,
      markdown: intent.sourceVersion.content,
    });
    await repository.markContentWritten(intent.submissionId, receipt);
    await env.DB.prepare("UPDATE tags SET status = 'disabled' WHERE id = 'tag-a'").run();

    await expect(repository.finalize(intent, chunksFor(intent))).rejects.toThrow();
    await expect(publicationState("submission-target-race")).resolves.toMatchObject({
      submissionStatus: "review_pending",
      intentState: "content_written",
      currentRevisionId: null,
      revisionCount: 0,
      reviewCount: 0,
      chunkCount: 0,
      auditCount: 0,
    });

    await env.DB.prepare("UPDATE tags SET status = 'active' WHERE id = 'tag-a'").run();
    const recreated = new PublicationService(new PublicationRepository(env.DB), durableContentCommitter());
    await expect(recreated.recoverPending(20)).resolves.toMatchObject({ recoveredIntents: 1, failures: [] });
  });

  it("rejects a cross-Space tag before intent creation and publishes an admin-only zero-tag selection", async () => {
    await seedReviewPendingSubmission("submission-cross-tag");
    await seedReviewPendingSubmission("submission-private");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at) VALUES ('other-space', 'other-space', 'Other', '', 'shared', 'active', 2, 0, ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO tags (id, space_id, slug, name, status, created_at, updated_at) VALUES ('tag-other', 'other-space', 'other', 'Other', 'active', ?, ?)").bind(now, now),
    ]);
    const blocked = new PublicationService(
      repositoryWithIds("knowledge-cross-tag", "revision-cross-tag"), durableContentCommitter(),
    );
    await expect(blocked.publish(adminReviewer, "submission-cross-tag", { ...publicationInput, tagIds: ["tag-other"] }))
      .rejects.toMatchObject({ code: "PUBLICATION_TARGET_INVALID", status: 400 });
    await expect(env.DB.prepare("SELECT 1 AS found FROM publication_intents WHERE submission_id = 'submission-cross-tag'").first())
      .resolves.toBeNull();

    const privateService = new PublicationService(
      repositoryWithIds("knowledge-private", "revision-private"), durableContentCommitter(),
    );
    await expect(privateService.publish(adminReviewer, "submission-private", {
      ...publicationInput,
      visibility: "admin_only",
      tagIds: [],
    })).resolves.toMatchObject({ visibility: "admin_only", tagIds: [], searchStatus: "indexed" });
    await expect(env.DB.prepare(
      "SELECT metadata FROM audit_events WHERE action = 'knowledge.published' AND json_extract(metadata, '$.submissionId') = 'submission-private'",
    ).first()).resolves.toEqual({
      metadata: JSON.stringify({ submissionId: "submission-private", revisionId: "revision-private", visibility: "admin_only" }),
    });
  });

  it("persists reject and revision-request decisions atomically without leaking review notes to audit", async () => {
    await seedReviewPendingSubmission("submission-reject");
    await seedReviewPendingSubmission("submission-revise");
    const repository = new PublicationRepository(env.DB);
    const service = new PublicationService(repository, durableContentCommitter());

    await service.reject(adminReviewer, "submission-reject", { reasonCode: "unsafe", note: "Private unsafe details" });
    await service.requestRevision(adminReviewer, "submission-revise", { reasonCode: "needs_revision", note: "Private correction details" });

    const rows = await env.DB.prepare(
      `SELECT s.id, s.status, r.decision, r.reason_code, r.reason, a.action, a.metadata
       FROM submissions s JOIN reviews r ON r.submission_id = s.id
       JOIN audit_events a ON a.resource_id = s.id
       WHERE s.id IN ('submission-reject', 'submission-revise') ORDER BY s.id`,
    ).all();
    expect(rows.results).toEqual([
      {
        id: "submission-reject", status: "rejected", decision: "rejected", reason_code: "unsafe",
        reason: "Private unsafe details", action: "submission.rejected", metadata: JSON.stringify({ reasonCode: "unsafe" }),
      },
      {
        id: "submission-revise", status: "revision_requested", decision: "revision_requested", reason_code: "needs_revision",
        reason: "Private correction details", action: "submission.revision_requested", metadata: JSON.stringify({ reasonCode: "needs_revision" }),
      },
    ]);
    expect(JSON.stringify(rows.results.map((row) => (row as { metadata: string }).metadata))).not.toContain("Private");
  });

  it("creates and lists active tags only in active writable Spaces", async () => {
    const service = new TagsService(new TagsRepository(env.DB), {
      id: () => "tag-created",
      now: () => new Date(now),
    });
    await expect(service.create({ spaceId: "default", slug: "created", name: "Created" }))
      .resolves.toMatchObject({ id: "tag-created", status: "active" });
    await env.DB.prepare("UPDATE tags SET status = 'disabled' WHERE id = 'tag-created'").run();
    await expect(service.listActive("default")).resolves.toEqual([
      expect.objectContaining({ id: "tag-a" }),
      expect.objectContaining({ id: "tag-b" }),
    ]);
    await env.DB.prepare("UPDATE spaces SET status = 'disabled' WHERE id = 'default'").run();
    await expect(service.create({ spaceId: "default", slug: "blocked", name: "Blocked" }))
      .rejects.toMatchObject({ code: "TAG_TARGET_INVALID", status: 400 });
  });
});

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function disposeWorkspace(workspace: WorkspaceClient): void {
  const disposeSymbol = (Symbol as typeof Symbol & { dispose?: symbol }).dispose;
  const disposable = workspace as unknown as Record<symbol, unknown>;
  const dispose = disposeSymbol ? disposable[disposeSymbol] : undefined;
  if (typeof dispose === "function") dispose.call(workspace);
}

const now = "2026-08-22T00:00:00.000Z";
const adminReviewer: PublicationReviewer = { id: "admin-1", role: "admin", status: "active" };
const publicationInput: PublishSubmissionInput = {
  title: "Reviewed title",
  visibility: "shared",
  spaceId: "default",
  collectionId: "collection-1",
  tagIds: ["tag-b", "tag-a"],
};

function repositoryWithIds(knowledgeItemId: string, revisionId: string): PublicationRepository {
  const ids = [knowledgeItemId, revisionId];
  return new PublicationRepository(env.DB, {
    id: () => ids.shift() || crypto.randomUUID(),
    now: () => new Date(now),
  });
}

function durableContentCommitter() {
  return {
    async commit(input: Parameters<KnowledgeBase["commitPublishedContent"]>[0]): Promise<PublishedContentReceipt> {
      const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName(`publication:${input.spaceId}`));
      return unwrapPublishedContent(await stub.commitPublishedContent(input));
    },
  };
}

function unwrapPublishedContent(result: RpcResult<PublishedContentReceipt>): PublishedContentReceipt {
  if (result.ok) return result.value;
  throw new AppError(result.error.code, result.error.message, result.error.status, result.error.retryable);
}

async function seedPublicationPrincipals(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('admin-1', 'github:admin-1', 'admin@example.test', 'admin', 'active', ?, ?)").bind(now, now),
    env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-1', 'github:member-1', 'member@example.test', 'contributor', 'active', ?, ?)").bind(now, now),
  ]);
}

async function seedPublicationTargets(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at) VALUES ('collection-1', 'default', NULL, 'Collection', '', 'active', 0, ?, ?)").bind(now, now),
    env.DB.prepare("INSERT INTO tags (id, space_id, slug, name, status, created_at, updated_at) VALUES ('tag-a', 'default', 'tag-a', 'Alpha Governance', 'active', ?, ?)").bind(now, now),
    env.DB.prepare("INSERT INTO tags (id, space_id, slug, name, status, created_at, updated_at) VALUES ('tag-b', 'default', 'tag-b', 'Beta Safety', 'active', ?, ?)").bind(now, now),
  ]);
}

async function seedReviewPendingSubmission(submissionId: string) {
  const parsed = await parseSource({
    kind: "markdown",
    content: "# Trusted\n\nFirst paragraph.\n\nSecond paragraph.\n",
  });
  const sourceId = `source-${submissionId}`;
  const sourceVersionId = `source-version-${submissionId}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, idempotency_key, created_at, updated_at)
       VALUES (?, 'member-1', 'default', 'collection-1', 'markdown', 'review_pending', 'Submitted title', ?, NULL, ?, ?)`,
    ).bind(submissionId, parsed.normalizedMarkdown, now, now),
    env.DB.prepare(
      "INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES (?, 'member-1', 'default', 'collection-1', 'markdown', 'Submitted title', ?, ?)",
    ).bind(sourceId, now, now),
    env.DB.prepare(
      "INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES (?, ?, ?, 1, ?, ?, 'm1-v1', ?)",
    ).bind(sourceVersionId, sourceId, submissionId, parsed.normalizedMarkdown, parsed.contentSha256, now),
  ]);
  return parsed;
}

async function publicationState(submissionId: string) {
  const row = await env.DB.prepare(
    `SELECT s.status AS submission_status, pi.state AS intent_state,
       ki.current_revision_id, ki.search_status, j.state AS job_state, j.attempts AS job_attempts
     FROM submissions s
     LEFT JOIN publication_intents pi ON pi.submission_id = s.id
     LEFT JOIN knowledge_items ki ON ki.id = pi.knowledge_item_id
     LEFT JOIN jobs j ON j.resource_id = pi.revision_id AND j.kind = 'index_revision'
     WHERE s.id = ?`,
  ).bind(submissionId).first<{
    submission_status: string;
    intent_state: string | null;
    current_revision_id: string | null;
    search_status: string | null;
    job_state: string | null;
    job_attempts: number | null;
  }>();
  if (!row) throw new Error("missing submission state");
  const revisionCount = await scalarCount("revisions", "source_version_id = ?", `source-version-${submissionId}`);
  const reviewCount = await scalarCount("reviews", "submission_id = ?", submissionId);
  const chunkCount = row.current_revision_id ? await scalarCount("chunks", "revision_id = ?", row.current_revision_id) : 0;
  const ftsExists = await env.DB.prepare("SELECT 1 AS found FROM sqlite_master WHERE name = 'chunks_fts'").first();
  const ftsCount = ftsExists && row.current_revision_id
    ? await env.DB.prepare("SELECT count(*) AS count FROM chunks_fts WHERE chunk_id IN (SELECT id FROM chunks WHERE revision_id = ?)").bind(row.current_revision_id).first<{ count: number }>().then((value) => value?.count ?? 0)
    : 0;
  const auditCount = await env.DB.prepare(
    "SELECT count(*) AS count FROM audit_events WHERE action = 'knowledge.published' AND json_extract(metadata, '$.submissionId') = ?",
  ).bind(submissionId).first<{ count: number }>().then((value) => value?.count ?? 0);
  return {
    submissionStatus: row.submission_status,
    intentState: row.intent_state,
    currentRevisionId: row.current_revision_id,
    searchStatus: row.search_status,
    jobState: row.job_state,
    jobAttempts: row.job_attempts,
    revisionCount,
    reviewCount,
    chunkCount,
    ftsCount,
    auditCount,
  };
}

async function finalizeWithoutIndex(repository: PublicationRepository, submissionId: string): Promise<void> {
  const intent = await repository.createOrReadIntent(
    submissionId,
    adminReviewer.id,
    { ...publicationInput, tagIds: ["tag-a", "tag-b"] },
  );
  const receipt = await durableContentCommitter().commit({
    spaceId: intent.spaceId,
    knowledgeItemId: intent.knowledgeItemId,
    revisionId: intent.revisionId,
    contentSha256: intent.contentSha256,
    markdown: intent.sourceVersion.content,
  });
  await repository.markContentWritten(intent.submissionId, receipt);
  await repository.finalize(intent, chunksFor(intent));
}

function chunksFor(intent: Awaited<ReturnType<PublicationRepository["createOrReadIntent"]>>) {
  return chunkDocument({
    normalizedMarkdown: intent.sourceVersion.content,
    kind: intent.sourceVersion.kind,
  });
}

async function scalarCount(table: "revisions" | "reviews" | "chunks", where: string, value: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT count(*) AS count FROM ${table} WHERE ${where}`).bind(value).first<{ count: number }>();
  return row?.count ?? 0;
}
