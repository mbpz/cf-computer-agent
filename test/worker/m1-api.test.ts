/// <reference types="@cloudflare/vitest-pool-workers/types" />

import {
  applyD1Migrations,
  createExecutionContext,
  env,
  reset,
  waitOnExecutionContext,
} from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { APP_CONFIG } from "../../src/config";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { MIGRATIONS } from "../fixtures/d1";

const now = "2026-08-22T00:00:00.000Z";
const AUTOMATION_ID = "fake-automation-client-id";
const AUTOMATION_SECRET = "fake-automation-secret";
const APP_TOKEN = "worker-test-token";
const sessionBySubject = new Map<string, string>();
let automationNonce = 0;

const fakeAi = {
  async run(_model: string, input: { messages: Array<{ content: string }>; response_format?: unknown }): Promise<unknown> {
    if (!input.response_format) return { response: "legacy local answer" };
    const marker = "输入 JSON：\n";
    const content = input.messages.at(-1)?.content || "";
    const serialized = content.slice(content.indexOf(marker) + marker.length);
    const context = JSON.parse(serialized) as { sources: Array<{ citationId: string }> };
    return {
      response: JSON.stringify({
        claims: [{ text: "Launch latency is documented.", citationIds: [context.sources[0]!.citationId] }],
        insufficientEvidence: false,
      }),
    };
  },
};

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, MIGRATIONS);
  await seedMembers();
  sessionBySubject.clear();
  automationNonce = 0;
  const repository = new MembersRepository(env.DB);
  const sessions = new SessionService(env.DB, repository, { waitUntil: () => undefined });
  for (const subject of ["contributor", "admin", "other"]) {
    const member = await repository.findByIdentitySubject(identitySubject(subject));
    sessionBySubject.set(subject, (await sessions.create(member!)).token);
  }
  const disabled = await repository.findByIdentitySubject(identitySubject("disabled"));
  await env.DB.prepare("UPDATE members SET status = 'active' WHERE id = ?").bind(disabled!.id).run();
  sessionBySubject.set("disabled", (await sessions.create({ ...disabled!, status: "active" })).token);
  await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = ?").bind(disabled!.id).run();
});

describe("M1 API authorization and request boundaries", () => {
  it("authorizes capabilities before malformed or oversized bodies, query values, and resource identifiers", async () => {
    const oversized = JSON.stringify({ question: "x".repeat(APP_CONFIG.maxJsonRequestBytes + 1) });

    await expectApiError(automationApi("/api/knowledge/chat", {
      method: "POST",
      body: "{malformed",
    }), 403, "FORBIDDEN");
    await expectApiError(memberApi("contributor", "/api/admin/submissions/%E0%A4%A/publish", {
      method: "POST",
      body: oversized,
    }), 403, "FORBIDDEN");
    await expectApiError(automationApi("/api/knowledge/search?q=%00"), 403, "FORBIDDEN");

    await expectApiError(memberApi("admin", "/api/knowledge/chat", {
      method: "POST",
      body: oversized,
    }), 413, "REQUEST_TOO_LARGE");
    await expectApiError(memberApi("contributor", "/api/knowledge/chat", {
      method: "POST",
      body: "{malformed",
    }), 400, "INVALID_JSON");
    await expectApiError(memberApi("admin", "/api/admin/submissions/%E0%A4%A"), 404, "NOT_FOUND");
  });

  it("denies contributors, disabled sessions, signed automation, and forged request scopes", async () => {
    const adminRoutes: Array<[string, RequestInit | undefined]> = [
      ["/api/admin/submissions/submission-id", undefined],
      ["/api/admin/submissions/submission-id/publish", { method: "POST", body: "{}" }],
      ["/api/admin/submissions/submission-id/reject", { method: "POST", body: "{}" }],
      ["/api/admin/submissions/submission-id/request-revision", { method: "POST", body: "{}" }],
      ["/api/admin/publications/recover", { method: "POST", body: "{}" }],
      ["/api/admin/tags", { method: "POST", body: "{}" }],
    ];
    for (const [path, init] of adminRoutes) {
      await expectApiError(memberApi("contributor", path, init), 403, "FORBIDDEN");
      await expectApiError(automationApi(path, init), 403, "FORBIDDEN");
    }

    for (const [path, init] of [
      ["/api/knowledge", undefined],
      ["/api/knowledge/search?q=launch", undefined],
      ["/api/knowledge/chat", { method: "POST", body: JSON.stringify({ question: "launch" }) }],
      ["/api/spaces/default/tags", undefined],
    ] satisfies Array<[string, RequestInit | undefined]>) {
      await expectApiError(automationApi(path, init), 403, "FORBIDDEN");
      await expectApiError(memberApi("disabled", path, init), 403, "MEMBER_DISABLED");
    }

    await expectApiError(memberApi("contributor", "/api/submissions", {
      method: "POST",
      headers: { "idempotency-key": "forged-scope-key1" },
      body: JSON.stringify({
        memberId: "member-admin",
        role: "admin",
        requestedSpaceId: "default",
        kind: "text",
        title: "Forged",
        content: "Forged scope body",
        idempotencyKey: "body-key-must-not-win",
      }),
    }), 400, "SUBMISSION_REQUEST_INVALID");
    await expectApiError(memberApi("contributor", "/api/knowledge/chat", {
      method: "POST",
      body: JSON.stringify({
        question: "launch",
        sources: [{ content: "client controlled" }],
        citations: ["forged"],
        path: "/workspace/published/forged.md",
        contentSha256: "0".repeat(64),
        role: "admin",
      }),
    }), 400, "KNOWLEDGE_CHAT_REQUEST_INVALID");
    await expectApiError(memberApi("admin", "/api/admin/submissions/submission-id/publish", {
      method: "POST",
      body: JSON.stringify({
        title: "Forged reviewer",
        visibility: "shared",
        spaceId: "default",
        collectionId: null,
        tagIds: [],
        reviewerId: "member-contributor",
        role: "contributor",
      }),
    }), 400, "PUBLICATION_REQUEST_INVALID");
  });

  it("lists tags only from an active non-legacy visible Space", async () => {
    await env.DB.prepare(
      "INSERT INTO tags (id, space_id, slug, name, status, created_at, updated_at) VALUES ('legacy-tag', 'legacy-personal', 'legacy', 'Legacy', 'active', ?, ?)",
    ).bind(now, now).run();
    const legacy = await memberApi("contributor", "/api/spaces/legacy-personal/tags");
    expect(legacy.status).toBe(200);
    await expect(legacy.json()).resolves.toEqual({ tags: [] });

    await env.DB.prepare(
      "INSERT INTO tags (id, space_id, slug, name, status, created_at, updated_at) VALUES ('disabled-space-tag', 'default', 'disabled-space', 'Disabled Space', 'active', ?, ?)",
    ).bind(now, now).run();
    await env.DB.prepare("UPDATE spaces SET status = 'disabled' WHERE id = 'default'").run();
    const disabled = await memberApi("contributor", "/api/spaces/default/tags");
    expect(disabled.status).toBe(200);
    await expect(disabled.json()).resolves.toEqual({ tags: [] });
  });

  it("bounds tag listing with an opaque keyset cursor", async () => {
    await env.DB.prepare(
      `INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at)
       VALUES ('tag-space-b', 'tag-space-b', 'Tag Space B', '', 'shared', 'active', 2, 0, ?, ?)`,
    ).bind(now, now).run();
    for (let index = 0; index < 7; index += 1) {
      await env.DB.prepare(
        "INSERT INTO tags (id, space_id, slug, name, status, created_at, updated_at) VALUES (?, 'default', ?, ?, 'active', ?, ?)",
      ).bind(`tag-${index}`, `tag-${index}`, `Tag ${index}`, now, now).run();
      await env.DB.prepare(
        "INSERT INTO tags (id, space_id, slug, name, status, created_at, updated_at) VALUES (?, 'tag-space-b', ?, ?, 'active', ?, ?)",
      ).bind(`tag-b-${index}`, `tag-b-${index}`, `Tag B ${index}`, now, now).run();
    }
    const first = await memberApi("contributor", "/api/spaces/default/tags?limit=3");
    expect(first.status).toBe(200);
    const firstBody = await first.json<{ tags: Array<{ id: string }>; nextCursor: string }>();
    expect(firstBody.tags).toHaveLength(3);
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const second = await memberApi(
      "contributor",
      `/api/spaces/default/tags?limit=3&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json<{ tags: Array<{ id: string }> }>();
    expect(secondBody.tags).toHaveLength(3);
    expect(new Set([...firstBody.tags, ...secondBody.tags].map((tag) => tag.id)).size).toBe(6);
    await expectApiError(memberApi(
      "contributor",
      `/api/spaces/tag-space-b/tags?limit=3&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
    ), 400, "PAGE_INVALID");
    await expectApiError(memberApi("contributor", "/api/spaces/default/tags?cursor=bad"), 400, "PAGE_CURSOR_INVALID");
  });

  it("enforces exact methods, media types, same-origin CSRF, unknown routes, and security headers", async () => {
    for (const [path, method, allow] of [
      ["/api/knowledge", "POST", "GET"],
      ["/api/knowledge/search", "POST", "GET"],
      ["/api/knowledge/chat", "GET", "POST"],
      ["/api/knowledge/item/revisions/revision", "POST", "GET"],
      ["/api/knowledge/citations/citation", "POST", "GET"],
      ["/api/admin/submissions/submission", "POST", "GET"],
      ["/api/admin/submissions/submission/publish", "GET", "POST"],
      ["/api/admin/submissions/submission/reject", "GET", "POST"],
      ["/api/admin/submissions/submission/request-revision", "GET", "POST"],
      ["/api/admin/publications/recover", "GET", "POST"],
      ["/api/admin/tags", "GET", "POST"],
      ["/api/spaces/default/tags", "POST", "GET"],
    ] as const) {
      const response = await memberApi("admin", path, { method });
      await expectApiError(Promise.resolve(response), 405, "METHOD_NOT_ALLOWED");
      expect(response.headers.get("allow")).toBe(allow);
    }

    await expectApiError(memberApi("admin", "/api/admin/publications/recover", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    }), 415, "UNSUPPORTED_MEDIA_TYPE");
    await expectApiError(rawMemberApi("admin", "/api/admin/publications/recover", {
      method: "POST",
      body: "{}",
    }), 403, "FORBIDDEN");
    await expectApiError(memberApi("admin", "/api/knowledge/not/a/route"), 404, "NOT_FOUND");
    await expectApiError(automationApi("/api/knowledge/not/a/route"), 403, "FORBIDDEN");

    const error = await memberApi("admin", "/api/knowledge/not/a/route", {
      headers: { "cf-ray": "m1-request-id" },
    });
    const body = await expectApiError(Promise.resolve(error), 404, "NOT_FOUND");
    expect(body.error.requestId).toBe("m1-request-id");
    expectSecurityHeaders(error, "m1-request-id");
  });

  it("applies CSRF and exact query/cursor parsing to every new request shape", async () => {
    for (const [path, body] of [
      ["/api/knowledge/chat", { question: "launch" }],
      ["/api/admin/submissions/submission/publish", {}],
      ["/api/admin/submissions/submission/reject", {}],
      ["/api/admin/submissions/submission/request-revision", {}],
      ["/api/admin/publications/recover", {}],
      ["/api/admin/tags", {}],
    ] as const) {
      await expectApiError(rawMemberApi("admin", path, {
        method: "POST",
        body: JSON.stringify(body),
      }), 403, "FORBIDDEN");
    }

    await expectApiError(memberApi("contributor", "/api/knowledge?unknown=x"), 400, "LIBRARY_REQUEST_INVALID");
    await expectApiError(memberApi("contributor", "/api/knowledge/search?q=launch&q=latency"), 400, "LIBRARY_REQUEST_INVALID");
    await expectApiError(memberApi("contributor", "/api/knowledge?limit=51"), 400, "PAGE_INVALID");
    await expectApiError(memberApi("contributor", "/api/knowledge?cursor=bad"), 400, "PAGE_CURSOR_INVALID");
    await expectApiError(memberApi("contributor", "/api/knowledge/absent?spaceId=default"), 400, "LIBRARY_REQUEST_INVALID");
    await expectApiError(memberApi("admin", "/api/admin/publications/recover?limit=20", {
      method: "POST",
      body: "{}",
    }), 400, "REQUEST_QUERY_INVALID");
    await expectApiError(memberApi("admin", "/api/admin/tags?spaceId=default", {
      method: "POST",
      body: JSON.stringify({ spaceId: "default", slug: "query", name: "Query" }),
    }), 400, "REQUEST_QUERY_INVALID");
    await expectApiError(memberApi("contributor", "/api/submissions?memberId=member-admin", {
      method: "POST",
      headers: { "idempotency-key": "query-scope-key01" },
      body: JSON.stringify({
        requestedSpaceId: "default", kind: "text", title: "Query", content: "Query body",
      }),
    }), 400, "REQUEST_QUERY_INVALID");
  });
});

describe("M1 trusted knowledge HTTP journey", () => {
  it("uses only the Idempotency-Key header and replays without duplicate writes", async () => {
    const input = {
      requestedSpaceId: "default" as const,
      kind: "text" as const,
      title: "Idempotent",
      content: "idempotent submission body",
    };
    const first = await createSubmission("contributor", input, "idempotent-key-01");
    const replay = await createSubmission("contributor", input, "idempotent-key-01");
    expect(replay.response.status).toBe(201);
    expect(replay.body.submission.id).toBe(first.body.submission.id);
    await expectApiError(memberApi("contributor", "/api/submissions", {
      method: "POST",
      headers: { "idempotency-key": "idempotent-key-01" },
      body: JSON.stringify({ ...input, content: "changed body" }),
    }), 409, "IDEMPOTENCY_CONFLICT");
    await expect(env.DB.prepare(
      "SELECT (SELECT count(*) FROM submissions) AS submissions, (SELECT count(*) FROM source_versions) AS versions",
    ).first()).resolves.toEqual({ submissions: 1, versions: 1 });
  });

  it("submits, reviews, publishes, lists, reads, searches, answers, and preserves citation history", async () => {
    const created = await createSubmission("contributor", {
      requestedSpaceId: "default",
      kind: "markdown",
      title: "Launch runbook",
      content: "# Launch\n\nLaunch latency is under 50ms.\n",
    }, "launch-submit-key1");
    expect(created.response.status).toBe(201);
    expect(created.body).toEqual({
      submission: expect.objectContaining({
        id: expect.any(String),
        submitterId: "member-contributor",
        title: "Launch runbook",
        status: "review_pending",
      }),
      duplicateCandidate: null,
    });
    expect(created.body).not.toHaveProperty("source");
    expect(created.body).not.toHaveProperty("sourceVersion");
    await expect(env.DB.prepare("SELECT count(*) AS count FROM source_versions").first())
      .resolves.toEqual({ count: 1 });

    const previewResponse = await memberApi("admin", `/api/admin/submissions/${created.body.submission.id}`);
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json<{ preview: Record<string, unknown> }>();
    expect(preview).toMatchObject({
      preview: {
        submissionId: created.body.submission.id,
        submitterId: "member-contributor",
        sourceVersion: { content: "# Launch\n\nLaunch latency is under 50ms.\n" },
      },
    });
    expect(JSON.stringify(preview)).not.toMatch(/contentSha256|normalizedPath|identitySubject|idempotency/i);

    const tagResponse = await memberApi("admin", "/api/admin/tags", {
      method: "POST",
      body: JSON.stringify({ spaceId: "default", slug: "runbook", name: "Runbook" }),
    });
    expect(tagResponse.status).toBe(201);
    const { tag } = await tagResponse.json<{ tag: { id: string; status: string } }>();
    expect(tag.status).toBe("active");
    const tagsResponse = await memberApi("contributor", "/api/spaces/default/tags");
    expect(tagsResponse.status).toBe(200);
    await expect(tagsResponse.json()).resolves.toEqual({ tags: [expect.objectContaining({ id: tag.id, slug: "runbook" })] });

    const publishResponse = await memberApi("admin", `/api/admin/submissions/${created.body.submission.id}/publish`, {
      method: "POST",
      body: JSON.stringify({
        title: "Launch runbook",
        visibility: "shared",
        spaceId: "default",
        collectionId: null,
        tagIds: [tag.id],
      }),
    });
    expect(publishResponse.status).toBe(200);
    const published = await publishResponse.json<{ revision: { id: string; knowledgeItemId: string; searchStatus: string } }>();
    expect(published.revision.searchStatus).toBe("indexed");
    expect(JSON.stringify(published)).not.toMatch(/contentSha256|normalizedPath/);

    const listResponse = await memberApi("contributor", "/api/knowledge?spaceId=default&limit=20");
    expect(listResponse.status).toBe(200);
    expectSecurityHeaders(listResponse);
    const list = await listResponse.json<{ items: Array<{ id: string; revisionId: string }> }>();
    expect(list.items).toEqual([expect.objectContaining({
      id: published.revision.knowledgeItemId,
      revisionId: published.revision.id,
    })]);

    const detailResponse = await memberApi("contributor", `/api/knowledge/${published.revision.knowledgeItemId}`);
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json<{ knowledge: { currentRevision: { markdown: string } } }>();
    expect(detail.knowledge.currentRevision.markdown).toBe("# Launch\n\nLaunch latency is under 50ms.\n");
    expect(JSON.stringify(detail)).not.toMatch(/contentSha256|normalizedPath/);

    const revisionResponse = await memberApi(
      "contributor",
      `/api/knowledge/${published.revision.knowledgeItemId}/revisions/${published.revision.id}`,
    );
    expect(revisionResponse.status).toBe(200);
    await expect(revisionResponse.json()).resolves.toMatchObject({ revision: { id: published.revision.id, isCurrent: true } });

    const searchResponse = await memberApi("contributor", "/api/knowledge/search?q=launch%20latency&limit=20");
    expect(searchResponse.status).toBe(200);
    const search = await searchResponse.json<{ items: Array<{ citationId: string }>; degraded: boolean }>();
    expect(search.degraded).toBe(false);
    expect(search.items).toHaveLength(1);

    const chatResponse = await memberApi("contributor", "/api/knowledge/chat", {
      method: "POST",
      body: JSON.stringify({ question: "launch latency" }),
    });
    expect(chatResponse.status).toBe(200);
    const answer = await chatResponse.json<{ answer: string; citations: string[]; sources: unknown[] }>();
    expect(answer.answer).toContain("[1]");
    expect(answer.citations).toEqual([search.items[0]!.citationId]);
    expect(answer.sources).toHaveLength(1);

    const citationResponse = await memberApi(
      "contributor",
      `/api/knowledge/citations/${encodeURIComponent(search.items[0]!.citationId)}`,
    );
    expect(citationResponse.status).toBe(200);
    await expect(citationResponse.json()).resolves.toMatchObject({
      citation: {
        citationId: search.items[0]!.citationId,
        body: expect.stringContaining("Launch latency"),
      },
    });

    await advanceCurrentRevision(published.revision.knowledgeItemId);
    const historicalCitation = await memberApi(
      "contributor",
      `/api/knowledge/citations/${encodeURIComponent(search.items[0]!.citationId)}`,
    );
    expect(historicalCitation.status).toBe(200);
    await expect(historicalCitation.json()).resolves.toMatchObject({
      citation: { citationId: search.items[0]!.citationId, revisionId: published.revision.id },
    });

    const recovery = await memberApi("admin", "/api/admin/publications/recover", {
      method: "POST",
      body: JSON.stringify({ limit: 20 }),
    });
    expect(recovery.status).toBe(200);
    await expect(recovery.json()).resolves.toEqual({
      recovery: { recoveredIntents: 0, recoveredIndexJobs: 0, failures: [] },
    });
  });

  it("keeps invisible resources indistinguishable and reports degraded search without breaking reads", async () => {
    const shared = await publishSubmission("contributor", "Shared degraded", "launch degraded evidence", "shared", "shared-degraded01");
    const hidden = await publishSubmission("other", "Hidden policy", "secret policy evidence", "admin_only", "hidden-policy-key1");

    const adminSearch = await memberApi("admin", "/api/knowledge/search?q=secret%20policy");
    const hiddenHit = (await adminSearch.json<{ items: Array<{ citationId: string }> }>()).items[0]!;
    for (const path of [
      `/api/knowledge/${hidden.knowledgeItemId}`,
      `/api/knowledge/${hidden.knowledgeItemId}/revisions/${hidden.id}`,
      `/api/knowledge/citations/${encodeURIComponent(hiddenHit.citationId)}`,
      "/api/knowledge/absent-item",
    ]) {
      await expectApiError(memberApi("contributor", path), 404, "KNOWLEDGE_NOT_FOUND");
    }

    const before = await memberApi("contributor", `/api/knowledge/${shared.knowledgeItemId}`);
    expect(before.status).toBe(200);
    await env.DB.prepare("UPDATE knowledge_items SET search_status = 'search_degraded' WHERE id = ?")
      .bind(shared.knowledgeItemId).run();
    await env.DB.prepare("DELETE FROM chunks_fts WHERE chunk_id IN (SELECT id FROM chunks WHERE revision_id = ?)")
      .bind(shared.id).run();

    const degraded = await memberApi("contributor", "/api/knowledge/search?q=launch%20degraded");
    expect(degraded.status).toBe(200);
    await expect(degraded.json()).resolves.toEqual({ items: [], degraded: true });
    const readable = await memberApi("contributor", `/api/knowledge/${shared.knowledgeItemId}`);
    expect(readable.status).toBe(200);
  });

  it("rejects and requests revision through admin-only bounded review APIs", async () => {
    const rejected = await createSubmission("contributor", {
      requestedSpaceId: "default", kind: "text", title: "Reject me", content: "reject body",
    }, "reject-submit-key1");
    const rejectResponse = await memberApi("admin", `/api/admin/submissions/${rejected.body.submission.id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reasonCode: "not_relevant", note: "Out of scope" }),
    });
    expect(rejectResponse.status).toBe(200);
    await expect(rejectResponse.json()).resolves.toMatchObject({
      decision: { submissionId: rejected.body.submission.id, decision: "rejected", reasonCode: "not_relevant" },
    });

    const revision = await createSubmission("contributor", {
      requestedSpaceId: "default", kind: "text", title: "Revise me", content: "revision body",
    }, "revise-submit-key1");
    const revisionResponse = await memberApi(
      "admin",
      `/api/admin/submissions/${revision.body.submission.id}/request-revision`,
      {
        method: "POST",
        body: JSON.stringify({ reasonCode: "needs_revision", note: "Add evidence" }),
      },
    );
    expect(revisionResponse.status).toBe(200);
    await expect(revisionResponse.json()).resolves.toMatchObject({
      decision: { submissionId: revision.body.submission.id, decision: "revision_requested", reasonCode: "needs_revision" },
    });
  });

  it("preserves the signed automation legacy response corpus", async () => {
    const health = await automationApi("/api/health");
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ ok: true });

    const created = await automationApi("/api/notes", {
      method: "POST",
      body: JSON.stringify({ id: "legacy-automation", title: "Legacy Automation", content: "legacy searchable body" }),
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toEqual({ note: expect.objectContaining({ id: "legacy-automation" }) });

    const notes = await automationApi("/api/notes");
    expect(notes.status).toBe(200);
    await expect(notes.json()).resolves.toEqual({ notes: [expect.objectContaining({ id: "legacy-automation" })] });
    const search = await automationApi("/api/search?q=searchable");
    expect(search.status).toBe(200);
    await expect(search.json()).resolves.toEqual({ hits: [expect.objectContaining({ id: "legacy-automation" })] });
    const chat = await automationApi("/api/chat", {
      method: "POST",
      body: JSON.stringify({ question: "searchable" }),
    });
    expect(chat.status).toBe(200);
    await expect(chat.json()).resolves.toEqual({
      answer: "legacy local answer",
      sources: [expect.objectContaining({ id: "legacy-automation" })],
    });
  });
});

async function createSubmission(
  subject: string,
  input: { requestedSpaceId: string; kind: "text" | "markdown" | "code"; title: string; content: string },
  idempotencyKey: string,
): Promise<{
  response: Response;
  body: { submission: { id: string; submitterId: string; status: string; title: string }; duplicateCandidate: null };
}> {
  const response = await memberApi(subject, "/api/submissions", {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify(input),
  });
  return { response, body: await response.clone().json() };
}

async function publishSubmission(
  subject: string,
  title: string,
  content: string,
  visibility: "shared" | "admin_only",
  key: string,
): Promise<{ id: string; knowledgeItemId: string }> {
  const created = await createSubmission(subject, {
    requestedSpaceId: "default", kind: "text", title, content,
  }, key);
  expect(created.response.status).toBe(201);
  const response = await memberApi("admin", `/api/admin/submissions/${created.body.submission.id}/publish`, {
    method: "POST",
    body: JSON.stringify({ title, visibility, spaceId: "default", collectionId: null, tagIds: [] }),
  });
  expect(response.status).toBe(200);
  return (await response.json<{ revision: { id: string; knowledgeItemId: string } }>()).revision;
}

async function advanceCurrentRevision(knowledgeItemId: string): Promise<void> {
  const suffix = knowledgeItemId.slice(0, 24);
  const submissionId = `history-sub-${suffix}`;
  const sourceId = `history-source-${suffix}`;
  const sourceVersionId = `history-version-${suffix}`;
  const revisionId = `history-revision-${suffix}`;
  const hash = "a".repeat(64);
  await env.DB.prepare(
    "INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, created_at, updated_at) VALUES (?, 'member-contributor', 'default', NULL, 'text', 'published', 'History', 'history', ?, ?)",
  ).bind(submissionId, now, now).run();
  await env.DB.prepare(
    "INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES (?, 'member-contributor', 'default', NULL, 'text', 'History', ?, ?)",
  ).bind(sourceId, now, now).run();
  await env.DB.prepare(
    "INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES (?, ?, ?, 1, 'history', ?, 'm1-v1', ?)",
  ).bind(sourceVersionId, sourceId, submissionId, hash, now).run();
  await env.DB.prepare(
    "INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES (?, ?, ?, ?, ?, 'History', '[]', 'shared', 'member-admin', ?)",
  ).bind(
    revisionId,
    knowledgeItemId,
    sourceVersionId,
    `/workspace/published/default/${knowledgeItemId}/${revisionId}.md`,
    hash,
    now,
  ).run();
  await env.DB.prepare("UPDATE knowledge_items SET current_revision_id = ?, updated_at = ? WHERE id = ?")
    .bind(revisionId, now, knowledgeItemId).run();
}

async function memberApi(subject: string, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("cookie", `__Host-memory-session=${sessionBySubject.get(subject)}`);
  if (!isSafeMethod(init?.method || "GET") && !headers.has("origin")) {
    headers.set("origin", APP_CONFIG.canonicalOrigin);
  }
  return execute(request(path, { ...init, headers }));
}

async function rawMemberApi(subject: string, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("cookie", `__Host-memory-session=${sessionBySubject.get(subject)}`);
  return execute(request(path, { ...init, headers }));
}

async function automationApi(path: string, init?: RequestInit): Promise<Response> {
  return execute(await signedAutomationRequest(path, init));
}

async function execute(req: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await createApp().fetch!(
    req as Request<unknown, IncomingRequestCfProperties<unknown>>,
    localEnv(),
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

function request(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Request(`https://example.test${path}`, { ...init, headers });
}

function localEnv(): Env {
  return {
    ...env,
    AI: fakeAi as unknown as Ai,
    BOOTSTRAP_ADMIN_EMAIL: "bootstrap-only@example.test",
    ALLOWED_MEMBER_EMAILS: "bootstrap-only@example.test",
    AUTOMATION_CLIENT_ID: AUTOMATION_ID,
    AUTOMATION_SECRET,
    APP_TOKEN,
  } as Env;
}

async function signedAutomationRequest(path: string, init: RequestInit = {}): Promise<Request> {
  const unsigned = request(path, init);
  const bodyBytes = new Uint8Array(await unsigned.clone().arrayBuffer());
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const nonceBytes = new Uint8Array(16);
  new DataView(nonceBytes.buffer).setUint32(12, automationNonce += 1);
  const nonce = base64Url(nonceBytes);
  const parsed = new URL(unsigned.url);
  const canonical = [
    unsigned.method,
    `${parsed.pathname}${parsed.search}`,
    timestamp,
    nonce,
    await sha256Hex(bodyBytes),
  ].join("\n");
  const headers = new Headers(unsigned.headers);
  headers.set("authorization", `Bearer ${APP_TOKEN}`);
  headers.set("x-automation-id", AUTOMATION_ID);
  headers.set("x-automation-timestamp", timestamp);
  headers.set("x-automation-nonce", nonce);
  headers.set("x-automation-signature", await hmacHex(AUTOMATION_SECRET, canonical));
  return new Request(unsigned, { headers });
}

async function seedMembers(): Promise<void> {
  for (const member of [
    ["member-contributor", identitySubject("contributor"), "contributor@example.test", "contributor", "active"],
    ["member-admin", identitySubject("admin"), "admin@example.test", "admin", "active"],
    ["member-other", identitySubject("other"), "other@example.test", "contributor", "active"],
    ["member-disabled", identitySubject("disabled"), "disabled@example.test", "contributor", "disabled"],
  ] as const) {
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(...member, now, now).run();
  }
}

function identitySubject(alias: string): string {
  return ({ contributor: "github:301", admin: "github:302", other: "github:303", disabled: "github:304" })[alias]!;
}

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function expectSecurityHeaders(response: Response, requestId?: string): void {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("x-frame-options")).toBe("DENY");
  if (requestId) expect(response.headers.get("x-request-id")).toBe(requestId);
  else expect(response.headers.get("x-request-id")).toBeTruthy();
}

async function expectApiError(
  response: Promise<Response>,
  status: number,
  code: string,
): Promise<{ error: { code: string; message: string; retryable: boolean; requestId: string } }> {
  const resolved = await response;
  expect(resolved.status).toBe(status);
  const body = await resolved.json<{ error: { code: string; message: string; retryable: boolean; requestId: string } }>();
  expect(body).toMatchObject({ error: { code, requestId: expect.any(String) } });
  expect(resolved.headers.get("x-request-id")).toBe(body.error.requestId);
  return body;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes))));
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
