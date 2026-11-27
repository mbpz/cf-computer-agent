/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { parseSource } from "../../src/sources/parser";
import { MIGRATIONS } from "../fixtures/d1";

const now = "2026-08-22T00:00:00.000Z";
const queuePath = "/api/admin/submissions?page=1&pageSize=20&status=review_pending";

interface QueueRow { id: string; status: string; updatedAt: string }
interface ReviewPreviewBody { submissionId: string; status: string; updatedAt: string }
interface DecisionBody { decision: { submissionId: string; decision: string; note: string; createdAt: string } }
interface RevisionBody { revision: { id: string; knowledgeItemId: string; searchStatus: string } }
interface ErrorBody { error: { code: string; details?: unknown } }

describe("administrator review decisions over HTTP", () => {
  let admin: string;
  let contributor: string;

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
    contributor = (await sessions.create((await members.findById("member-1"))!)).token;
  });

  it("gives a delegated reviewer a shared-only queue and no publish authority", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-2', 'github:member-2', 'delegate@example.test', 'contributor', 'active', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO roles (id, key, name, description, allow_bits, status, is_system, created_at, updated_at) VALUES ('role-review', 'review-delegate', 'Delegated review', 'Temporary delegate', '0x1600cb', 'active', 0, ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO role_members (role_id, member_id, created_at) VALUES ('role-review', 'member-2', ?)").bind(now),
    ]);
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
    const delegate = (await sessions.create((await members.findById("member-2"))!)).token;
    await seedReviewPending("submission-shared");
    await seedReviewPending("submission-admin-only", "admin_only");

    const queue = await queueItems(delegate);
    expect(queue.items.map((item) => item.id)).toEqual(["submission-shared"]);
    expect(queue.pagination.total).toBe(1);

    expect((await api(delegate, "/api/admin/submissions/submission-admin-only")).status).toBe(403);
    expect((await api(delegate, "/api/admin/submissions/submission-shared/publish", { method: "POST", body: JSON.stringify({ title: "x", visibility: "shared", spaceId: "default", collectionId: null, tagIds: [] }) })).status).toBe(403);

    const rejected = await api(delegate, "/api/admin/submissions/submission-shared/reject", {
      method: "POST",
      body: JSON.stringify({ reasonCode: "not_relevant", note: "delegated decision", operationId: "review.reject.delegate-1" }),
    });
    expect(rejected.status).toBe(200);
    expect(await count("SELECT COUNT(*) AS count FROM reviews WHERE submission_id = 'submission-shared' AND reviewer_id = 'member-2' AND decision = 'rejected'")).toBe(1);
  });

  it("does not let a delegated reviewer read or replay another reviewer's receipt", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-2', 'github:member-2', 'delegate@example.test', 'contributor', 'active', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO roles (id, key, name, description, allow_bits, status, is_system, created_at, updated_at) VALUES ('role-review', 'review-delegate', 'Delegated review', 'Temporary delegate', '0x1600cb', 'active', 0, ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO role_members (role_id, member_id, created_at) VALUES ('role-review', 'member-2', ?)").bind(now),
    ]);
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
    const delegate = (await sessions.create((await members.findById("member-2"))!)).token;
    await seedReviewPending("submission-owned-by-admin");
    const operationId = "review.reject.admin-owned";
    const owned = await api(admin, "/api/admin/submissions/submission-owned-by-admin/reject", {
      method: "POST",
      body: JSON.stringify({ reasonCode: "not_relevant", note: "admin decision", operationId }),
    });
    expect(owned.status).toBe(200);
    expect((await api(admin, `/api/admin/submissions/submission-owned-by-admin/decisions/operations/${operationId}`)).status).toBe(200);
    expect((await api(delegate, `/api/admin/submissions/submission-owned-by-admin/decisions/operations/${operationId}`)).status).toBe(404);

    const replay = await api(delegate, "/api/admin/submissions/submission-owned-by-admin/reject", {
      method: "POST",
      body: JSON.stringify({ reasonCode: "not_relevant", note: "admin decision", operationId }),
    });
    expect(replay.status).toBe(409);
    expect(await count("SELECT COUNT(*) AS count FROM reviews WHERE submission_id = 'submission-owned-by-admin'")).toBe(1);
  });

  it("re-checks the active review grant at the write across revocation shapes", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-2', 'github:member-2', 'delegate@example.test', 'contributor', 'active', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO roles (id, key, name, description, allow_bits, status, is_system, created_at, updated_at) VALUES ('role-review', 'review-delegate', 'Delegated review', 'Temporary delegate', '0x1600cb', 'active', 0, ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO role_members (role_id, member_id, created_at) VALUES ('role-review', 'member-2', ?)").bind(now),
    ]);
    let sequence = 0;
    const insertReceipt = async () => {
      sequence += 1;
      return env.DB.prepare(
        `INSERT INTO review_decision_receipts (submission_id, operation_id, kind, request_hash, actor_id, claim_id, response_json, created_at)
         VALUES (?, ?, 'review.reject', ?, 'member-2', ?, '{}', ?)`,
      ).bind(`submission-guard-${sequence}`, `review.reject.guard-${sequence}`, "b".repeat(64), `claim-guard-${sequence}`, now).run();
    };
    await expect(insertReceipt()).resolves.toBeDefined();

    await env.DB.prepare("UPDATE roles SET status = 'disabled' WHERE id = 'role-review'").run();
    await expect(insertReceipt()).rejects.toThrow(/REVIEWER_NOT_AUTHORIZED/);
    await env.DB.prepare("UPDATE roles SET status = 'active' WHERE id = 'role-review'").run();
    await env.DB.prepare("UPDATE roles SET allow_bits = '0x1600c3' WHERE id = 'role-review'").run();
    await expect(insertReceipt()).rejects.toThrow(/REVIEWER_NOT_AUTHORIZED/);
    await env.DB.prepare("UPDATE roles SET allow_bits = '0x1600cb' WHERE id = 'role-review'").run();
    await env.DB.prepare("DELETE FROM role_members WHERE role_id = 'role-review' AND member_id = 'member-2'").run();
    await expect(insertReceipt()).rejects.toThrow(/REVIEWER_NOT_AUTHORIZED/);
    await env.DB.prepare("INSERT INTO role_members (role_id, member_id, created_at) VALUES ('role-review', 'member-2', ?)").bind(now).run();
    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = 'member-2'").run();
    await expect(insertReceipt()).rejects.toThrow(/REVIEWER_NOT_AUTHORIZED/);
    await env.DB.prepare("UPDATE members SET status = 'active' WHERE id = 'member-2'").run();

    // A second valid grant keeps write authority after the first role is revoked.
    await env.DB.batch([
      env.DB.prepare("INSERT INTO roles (id, key, name, description, allow_bits, status, is_system, created_at, updated_at) VALUES ('role-review-2', 'review-delegate-2', 'Delegated review 2', 'Temporary delegate', '0x1600cb', 'active', 0, ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO role_members (role_id, member_id, created_at) VALUES ('role-review-2', 'member-2', ?)").bind(now),
    ]);
    await env.DB.prepare("DELETE FROM role_members WHERE role_id = 'role-review' AND member_id = 'member-2'").run();
    await expect(insertReceipt()).resolves.toBeDefined();
  });

  it("rejects a review receipt at the write when the actor has no active review grant", async () => {
    await expect(env.DB.prepare(
      `INSERT INTO review_decision_receipts (submission_id, operation_id, kind, request_hash, actor_id, claim_id, response_json, created_at)
       VALUES ('submission-guard', 'review.reject.guard', 'review.reject', ?, 'member-1', 'claim-guard', '{}', ?)`,
    ).bind("a".repeat(64), now).run()).rejects.toThrow(/REVIEWER_NOT_AUTHORIZED/);
  });

  it("replays one publish decision from the queue and the detail surface and reflects it in the queue", async () => {
    const submissionId = "submission-http-publish";
    await seedReviewPending(submissionId);

    // The queue row and the detail preview carry the same authoritative version.
    const queue = await queueItems(admin);
    expect(queue.items.find((item) => item.id === submissionId)).toMatchObject({
      id: submissionId, status: "review_pending", updatedAt: now,
    });
    const detail = await json<{ preview: ReviewPreviewBody }>(admin, `/api/admin/submissions/${submissionId}`);
    expect(detail.preview).toMatchObject({ submissionId, status: "review_pending", updatedAt: now });

    // One decision, one identity: the queue derives the same operation from the
    // detail read that the detail surface itself would send.
    const body = {
      title: "Submitted title", visibility: "shared", spaceId: "default", collectionId: null, tagIds: [],
      operationId: `review.publish.${submissionId}.${detail.preview.updatedAt}`,
      expectedUpdatedAt: detail.preview.updatedAt,
    };
    const published = await api(admin, `/api/admin/submissions/${submissionId}/publish`, { method: "POST", body: JSON.stringify(body) });
    expect(published.status).toBe(200);
    const revision = (await published.json<RevisionBody>()).revision;

    // A lost response is retried with the identical request and answers with the original Revision.
    const replay = await api(admin, `/api/admin/submissions/${submissionId}/publish`, { method: "POST", body: JSON.stringify(body) });
    expect(replay.status).toBe(200);
    expect((await replay.json<RevisionBody>()).revision).toEqual(revision);

    // Returning to the queue shows the authoritative result instead of a stale row.
    const after = await queueItems(admin);
    expect(after.items.find((item) => item.id === submissionId)).toBeUndefined();
    expect(after.pagination.total).toBe(0);

    expect(await decisionRows(submissionId)).toEqual({
      revisions: 1, reviews: 1, audits: 1, notices: 1, receipts: 1, intents: 1, indexJobs: 1,
    });
    expect(await count(
      "SELECT COUNT(*) AS count FROM review_decision_receipts WHERE submission_id = ? AND kind = 'review.publish' AND expected_version = ?",
      submissionId, now,
    )).toBe(1);
    expect(await count(
      "SELECT COUNT(*) AS count FROM audit_events WHERE action = 'knowledge.published' AND json_extract(metadata, '$.submissionId') = ?",
      submissionId,
    )).toBe(1);
  });

  it("rejects a stale decision with the authoritative version and recovers by re-reading", async () => {
    const submissionId = "submission-http-stale-reject";
    await seedReviewPending(submissionId);

    const stale = await api(admin, `/api/admin/submissions/${submissionId}/reject`, {
      method: "POST",
      body: JSON.stringify({
        reasonCode: "unsafe", note: "Made from an outdated read",
        operationId: `review.reject.${submissionId}.stale`, expectedUpdatedAt: "2026-08-01T00:00:00.000Z",
      }),
    });
    expect(stale.status).toBe(409);
    const error = (await stale.json<ErrorBody>()).error;
    expect(error.code).toBe("REVIEW_VERSION_CONFLICT");
    // The conflict names the current authoritative version, so re-reading is the recovery.
    expect(error.details).toEqual({ submissionId, status: "review_pending", updatedAt: now });
    expect(await decisionRows(submissionId)).toEqual({
      revisions: 0, reviews: 0, audits: 0, notices: 0, receipts: 0, intents: 0, indexJobs: 0,
    });

    const reRead = await json<{ preview: ReviewPreviewBody }>(admin, `/api/admin/submissions/${submissionId}`);
    expect(reRead.preview.updatedAt).toBe(now);
    const retry = {
      reasonCode: "unsafe", note: "Made from the re-read version",
      operationId: `review.reject.${submissionId}.${reRead.preview.updatedAt}`,
      expectedUpdatedAt: reRead.preview.updatedAt,
    };
    const accepted = await api(admin, `/api/admin/submissions/${submissionId}/reject`, { method: "POST", body: JSON.stringify(retry) });
    expect(accepted.status).toBe(200);
    const decision = (await accepted.json<DecisionBody>()).decision;
    expect(decision).toMatchObject({ submissionId, decision: "rejected", note: "Made from the re-read version" });

    const replay = await api(admin, `/api/admin/submissions/${submissionId}/reject`, { method: "POST", body: JSON.stringify(retry) });
    expect(replay.status).toBe(200);
    expect((await replay.json<DecisionBody>()).decision).toEqual(decision);
    expect(await decisionRows(submissionId)).toEqual({
      revisions: 0, reviews: 1, audits: 1, notices: 1, receipts: 1, intents: 0, indexJobs: 0,
    });

    const after = await queueItems(admin);
    expect(after.items.find((item) => item.id === submissionId)).toBeUndefined();
  });

  it("refuses to reuse an operation number for a different decision without a second write", async () => {
    const submissionId = "submission-http-operation-conflict";
    await seedReviewPending(submissionId);
    const operationId = `review.reject.${submissionId}.${now}`;
    const first = await api(admin, `/api/admin/submissions/${submissionId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reasonCode: "unsafe", note: "First", operationId, expectedUpdatedAt: now }),
    });
    expect(first.status).toBe(200);

    const reused = await api(admin, `/api/admin/submissions/${submissionId}/request-revision`, {
      method: "POST",
      body: JSON.stringify({ reasonCode: "needs_revision", note: "Second", operationId, expectedUpdatedAt: now }),
    });
    expect(reused.status).toBe(409);
    expect((await reused.json<ErrorBody>()).error).toMatchObject({
      code: "REVIEW_OPERATION_CONFLICT",
      details: { submissionId, operationId },
    });
    expect(await decisionRows(submissionId)).toEqual({
      revisions: 0, reviews: 1, audits: 1, notices: 1, receipts: 1, intents: 0, indexJobs: 0,
    });
  });

  it("converges a repeated request-revision on one status change, one audit and one notification, and leaves the submission editable", async () => {
    const submissionId = "submission-http-request-revision";
    await seedReviewPending(submissionId);
    const request = {
      reasonCode: "needs_revision", note: "Add the referenced source",
      operationId: `review.request_revision.${submissionId}.${now}`, expectedUpdatedAt: now,
    };
    const first = await api(admin, `/api/admin/submissions/${submissionId}/request-revision`, { method: "POST", body: JSON.stringify(request) });
    expect(first.status).toBe(200);
    const decision = await first.json<DecisionBody>();
    expect(decision.decision).toMatchObject({ submissionId, decision: "revision_requested", note: "Add the referenced source" });

    const replay = await api(admin, `/api/admin/submissions/${submissionId}/request-revision`, { method: "POST", body: JSON.stringify(request) });
    expect(replay.status).toBe(200);
    expect(await replay.json<DecisionBody>()).toEqual(decision);
    expect(await decisionRows(submissionId)).toEqual({
      revisions: 0, reviews: 1, audits: 1, notices: 1, receipts: 1, intents: 0, indexJobs: 0,
    });
    expect(await count(
      "SELECT COUNT(*) AS count FROM notifications WHERE target_id = ? AND event_type = 'submission.revision_requested'",
      submissionId,
    )).toBe(1);

    // The contributor keeps the original submission and its source version to edit from.
    const mine = await json<{ items: Array<{ id: string; status: string; title: string }> }>(
      contributor, "/api/submissions/mine?page=1&pageSize=20&status=revision_requested",
    );
    expect(mine.items.find((item) => item.id === submissionId)).toMatchObject({
      id: submissionId, status: "revision_requested", title: "Submitted title",
    });
    expect(await count("SELECT COUNT(*) AS count FROM source_versions WHERE submission_id = ?", submissionId)).toBe(1);
  });
});

async function seedReviewPending(submissionId: string, visibility: "shared" | "admin_only" = "shared"): Promise<void> {
  const parsed = await parseSource({
    kind: "markdown",
    content: "# Trusted\n\nFirst paragraph.\n\nSecond paragraph.\n",
  });
  const sourceId = `source-${submissionId}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, idempotency_key, created_at, updated_at, requested_visibility)
       VALUES (?, 'member-1', 'default', NULL, 'markdown', 'review_pending', 'Submitted title', ?, NULL, ?, ?, ?)`,
    ).bind(submissionId, parsed.normalizedMarkdown, now, now, visibility),
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

async function queueItems(token: string): Promise<{ items: QueueRow[]; pagination: { total: number } }> {
  return await json<{ items: QueueRow[]; pagination: { total: number } }>(token, queuePath);
}

async function count(sql: string, ...bindings: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql).bind(...bindings).first<{ count: number }>();
  return row?.count ?? 0;
}

/** Every durable row a decision can create, scoped to one submission. */
async function decisionRows(submissionId: string): Promise<{
  revisions: number; reviews: number; audits: number; notices: number;
  receipts: number; intents: number; indexJobs: number;
}> {
  return {
    revisions: await count(
      "SELECT COUNT(*) AS count FROM revisions r JOIN source_versions sv ON sv.id = r.source_version_id WHERE sv.submission_id = ?",
      submissionId,
    ),
    reviews: await count("SELECT COUNT(*) AS count FROM reviews WHERE submission_id = ?", submissionId),
    audits: await count(
      "SELECT COUNT(*) AS count FROM audit_events WHERE resource_id = ? OR json_extract(metadata, '$.submissionId') = ?",
      submissionId, submissionId,
    ),
    notices: await count("SELECT COUNT(*) AS count FROM notifications WHERE target_id = ?", submissionId),
    receipts: await count("SELECT COUNT(*) AS count FROM review_decision_receipts WHERE submission_id = ?", submissionId),
    intents: await count("SELECT COUNT(*) AS count FROM publication_intents WHERE submission_id = ?", submissionId),
    indexJobs: await count(
      "SELECT COUNT(*) AS count FROM jobs j JOIN publication_intents pi ON pi.revision_id = j.resource_id AND j.kind = 'index_revision' WHERE pi.submission_id = ?",
      submissionId,
    ),
  };
}
