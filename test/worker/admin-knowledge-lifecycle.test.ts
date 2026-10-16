/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { parseSource } from "../../src/sources/parser";
import { MIGRATIONS } from "../fixtures/d1";

const now = "2026-08-22T00:00:00.000Z";
const PURGE_BACKDATE = "2026-06-01T00:00:00.000Z";

interface RevisionBody {
  revision: { id: string; knowledgeItemId: string; visibility: string; searchStatus: string };
  previousRevisionId?: string;
}
interface KnowledgeBody { knowledge: { id: string; revisionId: string; status: string; visibility: string; title: string } }
interface TrashPageBody {
  items: Array<{
    id: string; revisionId: string; title: string; visibility: string; status: string;
    retention: { trashedAt: string; purgeEligibleAt: string; purgeable: boolean };
  }>;
  nextCursor?: string;
}
interface PurgeBody { purge: { knowledgeItemId: string; status: string; purgedRevisionCount: number; alreadyPurged?: boolean } }
interface BatchBody {
  requested: number; succeeded: number; failed: number;
  items: Array<{
    submissionId: string; action: string; status: string;
    error?: { code: string; status: number; retryable: boolean };
    result?: { decision?: string; id?: string };
  }>;
}
interface ErrorBody { error: { code: string; message: string; details?: unknown } }

describe("administrator knowledge lifecycle over HTTP", () => {
  let admin: string;

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('admin-1', 'github:admin-1', 'admin@example.test', 'admin', 'active', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-1', 'github:member-1', 'member@example.test', 'contributor', 'active', ?, ?)").bind(now, now),
    ]);
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
    admin = (await sessions.create((await members.findById("admin-1"))!)).token;
  });

  it("replays one trash and one restore from their recorded operations and audits each transition once", async () => {
    const item = await publishedItem(admin, "submission-lifecycle-trash");
    const trashBody = { operationId: "lifecycle-trash-1" };

    const trashed = await api(admin, `/api/admin/knowledge/${item.knowledgeItemId}/trash`, {
      method: "POST", body: JSON.stringify(trashBody),
    });
    expect(trashed.status).toBe(200);
    const trashedItem = (await trashed.json<KnowledgeBody>()).knowledge;
    expect(trashedItem).toMatchObject({ id: item.knowledgeItemId, status: "trashed" });

    // A lost response is retried with the identical request and answers with the
    // recorded transition instead of failing as an invalid lifecycle state.
    const replay = await api(admin, `/api/admin/knowledge/${item.knowledgeItemId}/trash`, {
      method: "POST", body: JSON.stringify(trashBody),
    });
    expect(replay.status).toBe(200);
    expect((await replay.json<KnowledgeBody>()).knowledge).toEqual(trashedItem);
    expect(await count("SELECT COUNT(*) AS count FROM audit_events WHERE resource_id = ? AND action = 'knowledge.trashed'", item.knowledgeItemId)).toBe(1);
    expect(await count("SELECT COUNT(*) AS count FROM knowledge_lifecycle_operation_receipts WHERE knowledge_item_id = ? AND operation_id = 'lifecycle-trash-1' AND kind = 'knowledge.trash'", item.knowledgeItemId)).toBe(1);

    // The number belongs to the write, not to a single call site: reusing it for
    // a different write is a conflict, never a second action.
    const reused = await api(admin, `/api/admin/knowledge/${item.knowledgeItemId}/restore`, {
      method: "POST", body: JSON.stringify(trashBody),
    });
    expect(reused.status).toBe(409);
    expect((await reused.json<ErrorBody>()).error.code).toBe("KNOWLEDGE_OPERATION_CONFLICT");
    expect(await count("SELECT COUNT(*) AS count FROM audit_events WHERE resource_id = ? AND action = 'knowledge.restored'", item.knowledgeItemId)).toBe(0);
    expect(await count("SELECT status AS count FROM knowledge_items WHERE id = ?", item.knowledgeItemId)).toBeDefined();

    const restoreBody = { operationId: "lifecycle-restore-1" };
    const restored = await api(admin, `/api/admin/knowledge/${item.knowledgeItemId}/restore`, {
      method: "POST", body: JSON.stringify(restoreBody),
    });
    expect(restored.status).toBe(200);
    // Restoring returns the item to the visibility it had before it was trashed.
    const restoredItem = (await restored.json<KnowledgeBody>()).knowledge;
    expect(restoredItem).toMatchObject({ id: item.knowledgeItemId, status: "active", visibility: "shared" });
    expect(restoredItem.revisionId).toBe(item.revisionId);

    const restoreReplay = await api(admin, `/api/admin/knowledge/${item.knowledgeItemId}/restore`, {
      method: "POST", body: JSON.stringify(restoreBody),
    });
    expect(restoreReplay.status).toBe(200);
    expect((await restoreReplay.json<KnowledgeBody>()).knowledge).toEqual(restoredItem);
    expect(await count("SELECT COUNT(*) AS count FROM audit_events WHERE resource_id = ? AND action = 'knowledge.restored'", item.knowledgeItemId)).toBe(1);
    expect(await count("SELECT COUNT(*) AS count FROM knowledge_lifecycle_operation_receipts WHERE knowledge_item_id = ?", item.knowledgeItemId)).toBe(2);
  });

  it("states the real retention window for trashed knowledge", async () => {
    const item = await publishedItem(admin, "submission-lifecycle-retention");
    await api(admin, `/api/admin/knowledge/${item.knowledgeItemId}/trash`, {
      method: "POST", body: JSON.stringify({ operationId: "lifecycle-retention-trash" }),
    });

    const page = await json<TrashPageBody>(admin, "/api/admin/knowledge/trash");
    const row = page.items.find((candidate) => candidate.id === item.knowledgeItemId);
    expect(row).toBeDefined();
    expect(row!.status).toBe("trashed");
    expect(row!.retention.trashedAt).toBe(await journalTimestamp(item.knowledgeItemId));
    expect(Date.parse(row!.retention.purgeEligibleAt)).toBe(Date.parse(row!.retention.trashedAt) + 30 * 24 * 60 * 60 * 1000);
    expect(row!.retention.purgeable).toBe(false);

    // A purge is refused while the retained window is still open: the freshly
    // trashed item is not eligible yet, and the server says so.
    const held = await api(admin, `/api/admin/knowledge/${item.knowledgeItemId}/purge`, {
      method: "POST", body: JSON.stringify({ confirm: item.knowledgeItemId, operationId: "lifecycle-retention-purge" }),
    });
    expect(held.status).toBe(409);
    expect((await held.json<ErrorBody>()).error.code).toBe("KNOWLEDGE_PURGE_RETENTION_ACTIVE");
    expect(await count("SELECT COUNT(*) AS count FROM knowledge_items WHERE id = ?", item.knowledgeItemId)).toBe(1);

    await backdateTrash(item.knowledgeItemId, PURGE_BACKDATE);
    const eligible = await json<TrashPageBody>(admin, "/api/admin/knowledge/trash");
    const expired = eligible.items.find((candidate) => candidate.id === item.knowledgeItemId);
    expect(expired!.retention.purgeable).toBe(true);
    expect(expired!.retention.purgeEligibleAt).toBe(new Date(Date.parse(PURGE_BACKDATE) + 30 * 24 * 60 * 60 * 1000).toISOString());
  });

  it("refuses a purge without the typed confirmation and replays a confirmed purge with its recorded count", async () => {
    const item = await publishedItem(admin, "submission-lifecycle-purge");
    await api(admin, `/api/admin/knowledge/${item.knowledgeItemId}/trash`, {
      method: "POST", body: JSON.stringify({ operationId: "lifecycle-purge-trash" }),
    });
    await backdateTrash(item.knowledgeItemId, PURGE_BACKDATE);

    const unconfined = await api(admin, `/api/admin/knowledge/${item.knowledgeItemId}/purge`, {
      method: "POST", body: JSON.stringify({ operationId: "lifecycle-purge-1" }),
    });
    expect(unconfined.status).toBe(400);
    expect((await unconfined.json<ErrorBody>()).error.code).toBe("KNOWLEDGE_PURGE_CONFIRMATION_REQUIRED");
    const wrongIdentifier = await api(admin, `/api/admin/knowledge/${item.knowledgeItemId}/purge`, {
      method: "POST", body: JSON.stringify({ confirm: "some-other-item", operationId: "lifecycle-purge-1" }),
    });
    expect(wrongIdentifier.status).toBe(400);
    expect((await wrongIdentifier.json<ErrorBody>()).error.code).toBe("KNOWLEDGE_PURGE_CONFIRMATION_REQUIRED");
    // Nothing was destroyed by a refused purge.
    expect(await count("SELECT COUNT(*) AS count FROM knowledge_items WHERE id = ?", item.knowledgeItemId)).toBe(1);
    expect(await count("SELECT COUNT(*) AS count FROM audit_events WHERE resource_id = ? AND action = 'knowledge.purged'", item.knowledgeItemId)).toBe(0);

    const body = { confirm: item.knowledgeItemId, operationId: "lifecycle-purge-1" };
    const purged = await api(admin, `/api/admin/knowledge/${item.knowledgeItemId}/purge`, { method: "POST", body: JSON.stringify(body) });
    expect(purged.status).toBe(200);
    const outcome = (await purged.json<PurgeBody>()).purge;
    expect(outcome).toMatchObject({ knowledgeItemId: item.knowledgeItemId, status: "purged" });
    expect(outcome.purgedRevisionCount).toBe(1);
    expect(outcome.alreadyPurged).toBeUndefined();

    // The replay answers with the count the first attempt destroyed, not with the
    // "nothing left to do" tombstone answer a fresh attempt would get.
    const replay = await api(admin, `/api/admin/knowledge/${item.knowledgeItemId}/purge`, { method: "POST", body: JSON.stringify(body) });
    expect(replay.status).toBe(200);
    expect((await replay.json<PurgeBody>()).purge).toEqual(outcome);
    expect(await count("SELECT COUNT(*) AS count FROM audit_events WHERE resource_id = ? AND action = 'knowledge.purged'", item.knowledgeItemId)).toBe(1);
    expect(await count("SELECT COUNT(*) AS count FROM knowledge_lifecycle_operation_receipts WHERE knowledge_item_id = ? AND operation_id = 'lifecycle-purge-1'", item.knowledgeItemId)).toBe(1);

    // A new operation number after the purge is the honest tombstone answer.
    const second = await api(admin, `/api/admin/knowledge/${item.knowledgeItemId}/purge`, {
      method: "POST", body: JSON.stringify({ confirm: item.knowledgeItemId, operationId: "lifecycle-purge-2" }),
    });
    expect(second.status).toBe(200);
    expect((await second.json<PurgeBody>()).purge).toMatchObject({ purgedRevisionCount: 0, alreadyPurged: true });
    expect(await count("SELECT COUNT(*) AS count FROM audit_events WHERE resource_id = ? AND action = 'knowledge.purged'", item.knowledgeItemId)).toBe(1);
  });

  it("rolls back to a named previous revision, states which it replaced, and replays once", async () => {
    const first = await publishedItem(admin, "submission-lifecycle-rollback-1");
    const second = await publishSecondRevision(admin, first.knowledgeItemId, "submission-lifecycle-rollback-2");

    const body = { revisionId: first.revisionId, operationId: "lifecycle-rollback-1" };
    const rolled = await api(admin, `/api/admin/knowledge/${first.knowledgeItemId}/rollback`, { method: "POST", body: JSON.stringify(body) });
    expect(rolled.status).toBe(200);
    const answer = await rolled.json<RevisionBody>();
    // The answer names both sides: the revision that is now current, and the one
    // it replaced.
    expect(answer.revision).toMatchObject({ id: first.revisionId, knowledgeItemId: first.knowledgeItemId });
    expect(answer.previousRevisionId).toBe(second.revisionId);

    const replay = await api(admin, `/api/admin/knowledge/${first.knowledgeItemId}/rollback`, { method: "POST", body: JSON.stringify(body) });
    expect(replay.status).toBe(200);
    expect(await replay.json<RevisionBody>()).toEqual(answer);
    expect(await count("SELECT COUNT(*) AS count FROM audit_events WHERE resource_id = ? AND action = 'knowledge.rolled_back'", first.knowledgeItemId)).toBe(1);
    expect(await count("SELECT COUNT(*) AS count FROM knowledge_lifecycle_operation_receipts WHERE knowledge_item_id = ? AND operation_id = 'lifecycle-rollback-1' AND kind = 'knowledge.rollback'", first.knowledgeItemId)).toBe(1);
    expect(await count("SELECT COUNT(*) AS count FROM knowledge_items WHERE id = ? AND current_revision_id = ?", first.knowledgeItemId, first.revisionId)).toBe(1);
  });

  it("applies the successful items of a partially failed batch and replays a retried item once", async () => {
    const applied = "submission-batch-applied";
    const failed = "submission-batch-failed";
    await seedReviewPending(applied);
    await seedReviewPending(failed);

    const firstAttempt = {
      actions: [
        { submissionId: applied, action: "reject", reasonCode: "duplicate", note: "Already known", operationId: "batch-applied-1", expectedUpdatedAt: now },
        { submissionId: failed, action: "reject", reasonCode: "unsafe", note: "Stale read", operationId: "batch-failed-1", expectedUpdatedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    const partial = await api(admin, "/api/admin/submissions/batch-review", { method: "POST", body: JSON.stringify(firstAttempt) });
    expect(partial.status).toBe(200);
    const partialBody = await partial.json<BatchBody>();
    expect(partialBody).toMatchObject({ requested: 2, succeeded: 1, failed: 1 });
    expect(partialBody.items.find((item) => item.submissionId === applied)).toMatchObject({ status: "succeeded", result: { decision: "rejected" } });
    expect(partialBody.items.find((item) => item.submissionId === failed)?.error?.code).toBe("REVIEW_VERSION_CONFLICT");

    // The successful item really committed while its neighbour did not.
    expect(await count("SELECT COUNT(*) AS count FROM reviews WHERE submission_id = ?", applied)).toBe(1);
    expect(await count("SELECT COUNT(*) AS count FROM reviews WHERE submission_id = ?", failed)).toBe(0);

    // Retrying only the failure succeeds; the already-applied item is untouched.
    const retry = {
      actions: [{ submissionId: failed, action: "reject", reasonCode: "unsafe", note: "Stale read", operationId: "batch-failed-1", expectedUpdatedAt: now }],
    };
    const retried = await api(admin, "/api/admin/submissions/batch-review", { method: "POST", body: JSON.stringify(retry) });
    expect(retried.status).toBe(200);
    expect(await retried.json<BatchBody>()).toMatchObject({ requested: 1, succeeded: 1, failed: 0 });
    expect(await count("SELECT COUNT(*) AS count FROM reviews WHERE submission_id = ?", failed)).toBe(1);
    expect(await count("SELECT COUNT(*) AS count FROM reviews WHERE submission_id = ?", applied)).toBe(1);

    // Replaying the whole batch decides nothing twice: each item answers from its
    // own recorded operation.
    const replay = await api(admin, "/api/admin/submissions/batch-review", { method: "POST", body: JSON.stringify(firstAttempt) });
    expect(replay.status).toBe(200);
    expect(await replay.json<BatchBody>()).toMatchObject({ requested: 2, succeeded: 1, failed: 1 });
    expect(await count("SELECT COUNT(*) AS count FROM reviews WHERE submission_id = ?", applied)).toBe(1);
    expect(await count("SELECT COUNT(*) AS count FROM reviews WHERE submission_id = ?", failed)).toBe(1);
    expect(await count("SELECT COUNT(*) AS count FROM audit_events WHERE resource_id = ? AND action = 'submission.rejected'", applied)).toBe(1);

    // A malformed item identity invalidates the request instead of silently
    // degrading that item to an unprotected write.
    const malformed = await api(admin, "/api/admin/submissions/batch-review", {
      method: "POST",
      body: JSON.stringify({ actions: [{ submissionId: applied, action: "reject", reasonCode: "unsafe", note: "x", operationId: "batch-malformed-1" }] }),
    });
    expect(malformed.status).toBe(400);
    expect((await malformed.json<ErrorBody>()).error.code).toBe("BATCH_REVIEW_REQUEST_INVALID");
  });
});

interface PublishedItem { knowledgeItemId: string; revisionId: string }

async function publishedItem(token: string, submissionId: string): Promise<PublishedItem> {
  await seedReviewPending(submissionId);
  const published = await api(token, `/api/admin/submissions/${submissionId}/publish`, {
    method: "POST",
    body: JSON.stringify({
      title: "Submitted title", visibility: "shared", spaceId: "default", collectionId: null, tagIds: [],
      operationId: `review.publish.${submissionId}`, expectedUpdatedAt: now,
    }),
  });
  expect(published.status).toBe(200);
  const revision = (await published.json<RevisionBody>()).revision;
  return { knowledgeItemId: revision.knowledgeItemId, revisionId: revision.id };
}

async function publishSecondRevision(token: string, knowledgeItemId: string, submissionId: string): Promise<{ revisionId: string }> {
  await seedReviewPending(submissionId);
  const published = await api(token, `/api/admin/submissions/${submissionId}/publish`, {
    method: "POST",
    body: JSON.stringify({
      title: "Submitted title", visibility: "shared", spaceId: "default", collectionId: null, tagIds: [],
      knowledgeItemId,
      operationId: `review.publish.${submissionId}`, expectedUpdatedAt: now,
    }),
  });
  expect(published.status).toBe(200);
  return { revisionId: (await published.json<RevisionBody>()).revision.id };
}

async function backdateTrash(knowledgeItemId: string, trashedAt: string): Promise<void> {
  await env.DB.prepare("UPDATE knowledge_items SET updated_at = ? WHERE id = ?").bind(trashedAt, knowledgeItemId).run();
}

async function journalTimestamp(knowledgeItemId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT updated_at FROM knowledge_items WHERE id = ?").bind(knowledgeItemId).first<{ updated_at: string }>();
  return row!.updated_at;
}

async function seedReviewPending(submissionId: string): Promise<void> {
  const parsed = await parseSource({
    kind: "markdown",
    content: "# Submitted title\n\nEvidence body.\n",
  });
  const sourceId = `source-${submissionId}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, idempotency_key, created_at, updated_at, requested_visibility)
       VALUES (?, 'member-1', 'default', NULL, 'markdown', 'review_pending', 'Submitted title', ?, NULL, ?, ?, 'shared')`,
    ).bind(submissionId, parsed.normalizedMarkdown, now, now),
    env.DB.prepare(
      "INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES (?, 'member-1', 'default', NULL, 'markdown', 'Submitted title', ?, ?)",
    ).bind(sourceId, now, now),
    env.DB.prepare(
      "INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES (?, ?, ?, 1, ?, ?, 'm1-v1', ?)",
    ).bind(`source-version-${submissionId}`, sourceId, submissionId, parsed.normalizedMarkdown, parsed.contentSha256, now),
  ]);
}

async function api(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("origin", "https://memory.crgmhrc.asia");
  headers.set("cookie", `__Host-memory-session=${token}`);
  const request = new Request(`https://memory.crgmhrc.asia${path}`, { ...init, headers });
  const context = createExecutionContext();
  const response = await createApp().fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}

async function json<T>(token: string, path: string): Promise<T> {
  const response = await api(token, path);
  expect(response.status).toBe(200);
  return await response.json<T>();
}

async function count(sql: string, ...bindings: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql).bind(...bindings).first<{ count: number }>();
  return row?.count ?? 0;
}
