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
import { chunkDocument } from "../../src/sources/chunker";
import {
  chatRequest,
  chatScopeControlsModel,
  citedAnswerModel,
  createMutationController,
} from "../../public/workspace-ui.js";
import { MIGRATIONS } from "../fixtures/d1";

const now = "2026-08-22T00:00:00.000Z";
const AUTOMATION_ID = "fake-automation-client-id";
const AUTOMATION_SECRET = "fake-automation-secret";
const APP_TOKEN = "worker-test-token";
const sessionBySubject = new Map<string, string>();
let automationNonce = 0;
let fakeAiCalls = 0;

const fakeAi = {
  async run(_model: string, input: { messages: Array<{ content: string }>; response_format?: unknown }): Promise<unknown> {
    fakeAiCalls += 1;
    if (!input.response_format) return { response: "legacy local answer" };
    const marker = "输入 JSON：\n";
    const content = input.messages.at(-1)?.content || "";
    const serialized = content.slice(content.indexOf(marker) + marker.length);
    const context = JSON.parse(serialized) as { sources: Array<{ citationId: string }> };
    return {
      response: JSON.stringify({
        claims: [{
          text: "Launch latency is documented.",
          citationIds: context.sources.map((source) => source.citationId),
        }],
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
  fakeAiCalls = 0;
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
  it("models exactly four localized-ready ChatScope controls and builds allowlisted bodies", async () => {
    const controls = chatScopeControlsModel({ kind: "collection", collectionId: "collection-1" });
    expect(controls.options).toEqual([
      { kind: "all", labelKey: "KNOWLEDGE_CHAT_SCOPE_ALL" },
      { kind: "space", labelKey: "KNOWLEDGE_CHAT_SCOPE_SPACE" },
      { kind: "collection", labelKey: "KNOWLEDGE_CHAT_SCOPE_COLLECTION" },
      { kind: "items", labelKey: "KNOWLEDGE_CHAT_SCOPE_ITEMS" },
    ]);
    expect(controls.selectedKind).toBe("collection");
    expect(controls.maxSelectedItems).toBe(8);

    for (const scope of [
      { kind: "all" },
      { kind: "space", spaceId: "default" },
      { kind: "collection", collectionId: "collection-1" },
      { kind: "items", knowledgeItemIds: ["knowledge-1", "knowledge-2"] },
    ]) {
      const built = chatRequest({
        question: "launch latency", scope, sources: ["forged"], role: "admin",
      });
      expect(JSON.parse(built.init.body)).toEqual({ question: "launch latency", scope });
    }
    expect(() => chatRequest({
      question: "launch",
      scope: { kind: "items", knowledgeItemIds: Array.from({ length: 9 }, (_, index) => `knowledge-${index}`) },
    })).toThrow(/Chat scope/u);
    for (const scope of [
      { kind: "all", spaceId: "default" },
      { kind: "space", spaceId: "default", collectionId: "collection-1" },
      { kind: "collection", collectionId: "collection-1", knowledgeItemIds: ["knowledge-1"] },
      { kind: "items", knowledgeItemIds: ["knowledge-1", "knowledge-1"] },
      { kind: "unknown" },
      undefined,
    ]) {
      expect(() => chatRequest({ question: "launch", scope })).toThrow(/Chat scope/u);
    }

    const view = citedAnswerModel({
      answer: "知识库中没有足够依据回答这个问题。",
      citations: [], sources: [], evidenceConfidence: 0.5,
      messageKey: "KNOWLEDGE_EVIDENCE_INSUFFICIENT",
      suggestedActionKeys: ["KNOWLEDGE_CHAT_REWRITE_QUESTION", "KNOWLEDGE_CHAT_EXPAND_SCOPE", "forged"],
    });
    expect(view).toMatchObject({
      evidenceConfidence: 0.5,
      messageKey: "KNOWLEDGE_EVIDENCE_INSUFFICIENT",
      suggestedActionKeys: ["KNOWLEDGE_CHAT_REWRITE_QUESTION", "KNOWLEDGE_CHAT_EXPAND_SCOPE"],
    });

    let owns = true;
    let aiCalls = 0;
    let resolveAi!: () => void;
    const ai = new Promise<void>((resolve) => { resolveAi = resolve; });
    const mutation = createMutationController(() => owns, () => undefined);
    const first = mutation.run(async () => { aiCalls += 1; await ai; }, () => undefined, () => undefined);
    const localeRerender = mutation.run(async () => { aiCalls += 1; }, () => undefined, () => undefined);
    expect(localeRerender).toBe(first);
    expect(aiCalls).toBe(1);
    owns = false;
    resolveAi();
    await first;
    await mutation.run(async () => { aiCalls += 1; }, () => undefined, () => undefined);
    expect(aiCalls).toBe(1);
  });

  it("accepts only canonical base64 source bytes and persists M1-v2 code metadata", async () => {
    const contentBase64 = btoa("const x = 1;\\r\\n");
    const created = await memberApi("contributor", "/api/submissions", {
      method: "POST",
      headers: { "idempotency-key": "base64-source-key1" },
      body: JSON.stringify({
        requestedSpaceId: "default", requestedCollectionId: null, kind: "code", title: "Example",
        contentBase64, language: "javascript", fileLabel: "example.js", lineBaseline: 7,
      }),
    });
    expect(created.status).toBe(201);
    await expect(env.DB.prepare(
      "SELECT parser_schema_version, source_identity_sha256, code_language, file_label, line_baseline FROM source_versions",
    ).first()).resolves.toEqual({
      parser_schema_version: "m1-v2", source_identity_sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      code_language: "javascript", file_label: "example.js", line_baseline: 7,
    });
    const createdBody = await created.json<{ submission: { id: string } }>();
    const published = await memberApi("admin", `/api/admin/submissions/${createdBody.submission.id}/publish`, {
      method: "POST",
      body: JSON.stringify({ title: "Example", visibility: "shared", spaceId: "default", collectionId: null, tagIds: [] }),
    });
    expect(published.status).toBe(200);
    await expect(env.DB.prepare("SELECT start_line, end_line FROM chunks").first())
      .resolves.toEqual({ start_line: 7, end_line: 7 });

    await expectApiError(memberApi("contributor", "/api/submissions", {
      method: "POST",
      headers: { "idempotency-key": "mixed-source-key01" },
      body: JSON.stringify({
        requestedSpaceId: "default", kind: "text", title: "Mixed", content: "text", contentBase64: "dGV4dA==",
      }),
    }), 400, "SUBMISSION_REQUEST_INVALID");
    await expectApiError(memberApi("contributor", "/api/submissions", {
      method: "POST",
      headers: { "idempotency-key": "bad-base64-key001" },
      body: JSON.stringify({ requestedSpaceId: "default", kind: "text", title: "Bad", contentBase64: "YQ" }),
    }), 400, "SOURCE_ENCODING_INVALID");
    await expectApiError(automationApi("/api/submissions", { method: "POST", body: "{not-json" }), 403, "FORBIDDEN");

    const exactSource = await memberApi("contributor", "/api/submissions", {
      method: "POST",
      headers: { "idempotency-key": "exact-base64-key01" },
      body: JSON.stringify({
        requestedSpaceId: "default", kind: "markdown", title: "Exact bound",
        contentBase64: btoa("a".repeat(128 * 1024 - 1)),
      }),
    });
    expect(exactSource.status).toBe(201);
  });
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
      ["/api/knowledge/chat", { method: "POST", body: JSON.stringify({ question: "launch", scope: { kind: "all" } }) }],
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
        scope: { kind: "all" },
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

  it("loads Tag 51 with an opaque Space-scoped keyset cursor", async () => {
    await env.DB.prepare(
      `INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at)
       VALUES ('tag-space-b', 'tag-space-b', 'Tag Space B', '', 'shared', 'active', 2, 0, ?, ?)`,
    ).bind(now, now).run();
    for (let index = 0; index < 51; index += 1) {
      const suffix = String(index).padStart(2, "0");
      const createdAt = index === 50 ? "2026-08-21T00:00:00.000Z" : now;
      await env.DB.prepare(
        "INSERT INTO tags (id, space_id, slug, name, status, created_at, updated_at) VALUES (?, 'default', ?, ?, 'active', ?, ?)",
      ).bind(`tag-${suffix}`, `tag-${suffix}`, `Tag ${index}`, createdAt, now).run();
      await env.DB.prepare(
        "INSERT INTO tags (id, space_id, slug, name, status, created_at, updated_at) VALUES (?, 'tag-space-b', ?, ?, 'active', ?, ?)",
      ).bind(`tag-b-${suffix}`, `tag-b-${suffix}`, `Tag B ${index}`, createdAt, now).run();
    }
    const first = await memberApi("contributor", "/api/spaces/default/tags?limit=50");
    expect(first.status).toBe(200);
    const firstBody = await first.json<{ tags: Array<{ id: string }>; nextCursor: string }>();
    expect(firstBody.tags).toHaveLength(50);
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const second = await memberApi(
      "contributor",
      `/api/spaces/default/tags?limit=50&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json<{ tags: Array<{ id: string }> }>();
    expect(secondBody.tags).toEqual([{ id: "tag-50", spaceId: "default", slug: "tag-50", name: "Tag 50", status: "active", createdAt: "2026-08-21T00:00:00.000Z", updatedAt: now }]);
    expect(new Set([...firstBody.tags, ...secondBody.tags].map((tag) => tag.id)).size).toBe(51);
    await expectApiError(memberApi(
      "contributor",
      `/api/spaces/tag-space-b/tags?limit=50&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
    ), 400, "PAGE_INVALID");
    await expectApiError(memberApi("contributor", "/api/spaces/default/tags?cursor=bad"), 400, "PAGE_CURSOR_INVALID");
  });

  it("enforces exact methods, media types, same-origin CSRF, unknown routes, and security headers", async () => {
    for (const [path, method, allow] of [
      ["/api/knowledge", "POST", "GET"],
      ["/api/knowledge/search", "POST", "GET"],
      ["/api/knowledge/chat", "GET", "POST"],
      ["/api/knowledge/item/revisions/revision", "POST", "GET"],
      ["/api/knowledge/item/revisions/revision/download", "POST", "GET"],
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
      ["/api/knowledge/chat", { question: "launch", scope: { kind: "all" } }],
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
    const boundedTags = await memberApi(
      "contributor",
      "/api/knowledge/search?q=launch&spaceId=default&tagId=tag-a&tagId=tag-b&tagMode=or",
    );
    expect(boundedTags.status).toBe(200);
    await expect(boundedTags.json()).resolves.toEqual({ items: [], degraded: false });
    await expectApiError(memberApi("contributor", "/api/knowledge/search?q=launch&spaceId=default&tagId=tag-a"), 400, "LIBRARY_REQUEST_INVALID");
    await expectApiError(memberApi("contributor", "/api/knowledge/search?q=launch&spaceId=default&tagId=tag-a&tagMode=x"), 400, "LIBRARY_REQUEST_INVALID");
    await expectApiError(memberApi("contributor", `/api/knowledge/search?q=launch&spaceId=default&tagMode=or&${Array.from({ length: 9 }, (_, index) => `tagId=tag-${index}`).join("&")}`), 400, "LIBRARY_REQUEST_INVALID");
    await expectApiError(memberApi("contributor", "/api/knowledge?limit=51"), 400, "PAGE_INVALID");
    await expectApiError(memberApi("contributor", "/api/knowledge?cursor=bad"), 400, "PAGE_CURSOR_INVALID");
    await expectApiError(memberApi("contributor", "/api/knowledge/absent?spaceId=default"), 400, "LIBRARY_REQUEST_INVALID");
    expect((await memberApi("contributor", "/api/submissions/mine?status=review_pending")).status).toBe(200);
    await expectApiError(memberApi("contributor", "/api/submissions/mine?status=draft"), 400, "PAGE_INVALID");
    await expectApiError(memberApi("contributor", "/api/submissions/mine?status=published&status=rejected"), 400, "PAGE_INVALID");
    await expectApiError(memberApi("contributor", "/api/submissions/mine?ownerId=member-other"), 400, "PAGE_INVALID");
    await expectApiError(memberApi(
      "contributor",
      "/api/knowledge/item/revisions/revision/download?path=%2Fworkspace%2Fsecret&hash=forged",
    ), 400, "LIBRARY_REQUEST_INVALID");
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
  it("keeps requested admin-only visibility authoritative and requires expansion confirmation", async () => {
    const created = await memberApi("contributor", "/api/submissions", {
      method: "POST",
      headers: { "idempotency-key": "admin-only-source1" },
      body: JSON.stringify({
        requestedSpaceId: "default", requestedVisibility: "admin_only", kind: "text",
        title: "Private request", content: "Private requested source",
      }),
    });
    expect(created.status).toBe(201);
    const body = await created.json<{ submission: { id: string; requestedVisibility: string } }>();
    expect(body.submission.requestedVisibility).toBe("admin_only");
    const preview = await memberApi("admin", `/api/admin/submissions/${body.submission.id}`);
    await expect(preview.json()).resolves.toMatchObject({ preview: { requestedVisibility: "admin_only" } });

    await expectApiError(memberApi("admin", `/api/admin/submissions/${body.submission.id}/publish`, {
      method: "POST",
      body: JSON.stringify({
        title: "Private request", visibility: "shared", spaceId: "default", collectionId: null, tagIds: [],
      }),
    }), 400, "PUBLICATION_VISIBILITY_EXPANSION_CONFIRMATION_REQUIRED");
    const published = await memberApi("admin", `/api/admin/submissions/${body.submission.id}/publish`, {
      method: "POST",
      body: JSON.stringify({
        title: "Private request", visibility: "shared", spaceId: "default", collectionId: null, tagIds: [],
        visibilityReasonCode: "admin_visibility_expansion",
      }),
    });
    expect(published.status).toBe(200);
    await expect(env.DB.prepare(
      "SELECT action, metadata FROM audit_events WHERE action = 'review.visibility_expanded'",
    ).first()).resolves.toEqual({
      action: "review.visibility_expanded",
      metadata: JSON.stringify({
        requestedVisibility: "admin_only", finalVisibility: "shared", reasonCode: "admin_visibility_expansion",
      }),
    });
  });

  it("lets only the active owner revise and resubmit a terminal revision request", async () => {
    const created = await createSubmission("contributor", {
      requestedSpaceId: "default", requestedVisibility: "admin_only", kind: "markdown",
      title: "Needs work", content: "# Original\n",
    }, "revision-source-key1");
    const priorId = created.body.submission.id;
    const requested = await memberApi("admin", `/api/admin/submissions/${priorId}/request-revision`, {
      method: "POST", body: JSON.stringify({ reasonCode: "needs_revision", note: "Add evidence" }),
    });
    expect(requested.status).toBe(200);

    await expectApiError(memberApi("other", `/api/submissions/${priorId}/resubmit`, {
      method: "POST", headers: { "idempotency-key": "other-resubmit-key" }, body: "{not-json",
    }), 404, "SUBMISSION_NOT_FOUND");
    const beforeWidening = await resubmissionSideEffectCounts(priorId);
    const wideningInit = {
      method: "POST",
      headers: { "idempotency-key": "owner-widening-key1" },
      body: JSON.stringify({
        requestedVisibility: "shared", kind: "markdown", title: "Widened", content: "# Widened\n",
      }),
    };
    const [firstWidening, concurrentWidening, forgedWidening] = await Promise.all([
      memberApi("contributor", `/api/submissions/${priorId}/resubmit`, wideningInit),
      memberApi("contributor", `/api/submissions/${priorId}/resubmit`, wideningInit),
      memberApi("other", `/api/submissions/${priorId}/resubmit`, {
        ...wideningInit, headers: { "idempotency-key": "forged-widening-key" },
      }),
    ]);
    await expectApiError(Promise.resolve(firstWidening), 400, "SUBMISSION_VISIBILITY_EXPANSION_FORBIDDEN");
    await expectApiError(Promise.resolve(concurrentWidening), 400, "SUBMISSION_VISIBILITY_EXPANSION_FORBIDDEN");
    await expectApiError(Promise.resolve(forgedWidening), 404, "SUBMISSION_NOT_FOUND");
    await expect(resubmissionSideEffectCounts(priorId)).resolves.toEqual(beforeWidening);
    const resubmitInit = {
      method: "POST",
      headers: { "idempotency-key": "owner-resubmit-key" },
      body: JSON.stringify({ kind: "markdown", title: "Revised", content: "# Revised\n\nEvidence.\n" }),
    };
    const [resubmitted, replay] = await Promise.all([
      memberApi("contributor", `/api/submissions/${priorId}/resubmit`, resubmitInit),
      memberApi("contributor", `/api/submissions/${priorId}/resubmit`, resubmitInit),
    ]);
    expect(resubmitted.status).toBe(201);
    expect(replay.status).toBe(201);
    const result = await resubmitted.json<{ submission: { id: string; supersedesSubmissionId: string; requestedVisibility: string } }>();
    expect(result.submission).toMatchObject({
      supersedesSubmissionId: priorId, requestedVisibility: "admin_only",
    });
    expect(result.submission.id).not.toBe(priorId);

    await expect(replay.json()).resolves.toMatchObject({ submission: { id: result.submission.id } });
    await expectApiError(memberApi("admin", `/api/admin/submissions/${priorId}/publish`, {
      method: "POST",
      body: JSON.stringify({ title: "Old", visibility: "admin_only", spaceId: "default", collectionId: null, tagIds: [] }),
    }), 409, "PUBLICATION_STATE_CONFLICT");
    await expect(env.DB.prepare(
      `SELECT old.status AS old_status, newer.status AS new_status, newer.supersedes_submission_id,
         (SELECT count(*) FROM source_versions WHERE submission_id IN (old.id, newer.id)) AS versions
       FROM submissions old JOIN submissions newer ON newer.supersedes_submission_id = old.id
       WHERE old.id = ?`,
    ).bind(priorId).first()).resolves.toEqual({
      old_status: "revision_requested", new_status: "review_pending",
      supersedes_submission_id: priorId, versions: 2,
    });
  });
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
      content: "# Launch  \r\n\r\nLaunch latency is under 50ms.   \r\n",
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
        rawContent: "# Launch  \r\n\r\nLaunch latency is under 50ms.   \r\n",
        sourceVersion: { content: "# Launch\n\nLaunch latency is under 50ms.\n" },
        chunks: chunkDocument({
          normalizedMarkdown: "# Launch\n\nLaunch latency is under 50ms.\n",
          kind: "markdown",
        }).map((chunk) => ({
          headingPath: chunk.headingPath,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          excerpt: [...chunk.body].slice(0, 240).join(""),
        })),
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
    const detail = await detailResponse.json<{ knowledge: { currentRevision: Record<string, unknown> & { markdown: string } } }>();
    expect(detail.knowledge.currentRevision.markdown).toBe("# Launch\n\nLaunch latency is under 50ms.\n");
    expect(detail.knowledge.currentRevision).toMatchObject({
      sourceVersionId: expect.any(String),
      reviewerId: "member-admin",
      sourceVersionOrdinal: 1,
      parserSchemaVersion: "m1-v2",
      codeMetadata: null,
      indexStatus: "indexed",
    });
    expect(JSON.stringify(detail)).not.toMatch(/contentSha256|normalizedPath/);

    const revisionResponse = await memberApi(
      "contributor",
      `/api/knowledge/${published.revision.knowledgeItemId}/revisions/${published.revision.id}`,
    );
    expect(revisionResponse.status).toBe(200);
    await expect(revisionResponse.json()).resolves.toMatchObject({ revision: { id: published.revision.id, isCurrent: true } });

    await env.DB.prepare("UPDATE revisions SET title = ? WHERE id = ?")
      .bind("../../Launch\r\nX-Evil: injected", published.revision.id).run();
    const downloadResponse = await memberApi(
      "contributor",
      `/api/knowledge/${published.revision.knowledgeItemId}/revisions/${published.revision.id}/download`,
      { headers: { "cf-ray": "download-request-id" } },
    );
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    const disposition = downloadResponse.headers.get("content-disposition") || "";
    expect(disposition).toMatch(/^attachment; filename="[A-Za-z0-9._ -]+\.md"$/u);
    expect(disposition).not.toMatch(/[\r\n\\/]/u);
    expect(downloadResponse.headers.get("x-evil")).toBeNull();
    expectSecurityHeaders(downloadResponse, "download-request-id");
    await expect(downloadResponse.text()).resolves.toBe("# Launch\n\nLaunch latency is under 50ms.\n");

    const searchResponse = await memberApi("contributor", "/api/knowledge/search?q=launch%20latency&limit=20");
    expect(searchResponse.status).toBe(200);
    const search = await searchResponse.json<{ items: Array<{ citationId: string }>; degraded: boolean }>();
    expect(search.degraded).toBe(false);
    expect(search.items).toHaveLength(1);

    const chatResponse = await memberApi("contributor", "/api/knowledge/chat", {
      method: "POST",
      body: JSON.stringify({ question: "launch latency", scope: { kind: "all" } }),
    });
    expect(chatResponse.status).toBe(200);
    const answer = await chatResponse.json<{
      answer: string;
      citations: string[];
      sources: unknown[];
      evidenceConfidence: number;
    }>();
    expect(answer.answer).toContain("[1]");
    expect(answer.citations).toEqual([search.items[0]!.citationId]);
    expect(answer.sources).toHaveLength(1);
    expect(answer.evidenceConfidence).toBe(0.85);

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

    await advanceCurrentRevision(published.revision.knowledgeItemId, "admin_only");
    const historicalRevision = await memberApi(
      "contributor",
      `/api/knowledge/${published.revision.knowledgeItemId}/revisions/${published.revision.id}`,
    );
    expect(historicalRevision.status).toBe(200);
    await expect(historicalRevision.json()).resolves.toMatchObject({
      revision: {
        id: published.revision.id,
        isCurrent: false,
        visibility: "shared",
        chunks: [expect.objectContaining({ citationId: search.items[0]!.citationId })],
      },
    });
    const historicalCitation = await memberApi(
      "contributor",
      `/api/knowledge/citations/${encodeURIComponent(search.items[0]!.citationId)}`,
    );
    expect(historicalCitation.status).toBe(200);
    await expect(historicalCitation.json()).resolves.toMatchObject({
      citation: { citationId: search.items[0]!.citationId, revisionId: published.revision.id },
    });
    const historicalDownload = await memberApi(
      "contributor",
      `/api/knowledge/${published.revision.knowledgeItemId}/revisions/${published.revision.id}/download`,
    );
    expect(historicalDownload.status).toBe(200);
    await expect(historicalDownload.text()).resolves.toBe("# Launch\n\nLaunch latency is under 50ms.\n");
    await expectApiError(
      memberApi("contributor", `/api/knowledge/${published.revision.knowledgeItemId}`),
      404,
      "KNOWLEDGE_NOT_FOUND",
    );

    const recovery = await memberApi("admin", "/api/admin/publications/recover", {
      method: "POST",
      body: JSON.stringify({ limit: 20 }),
    });
    expect(recovery.status).toBe(200);
    await expect(recovery.json()).resolves.toEqual({
      recovery: { recoveredIntents: 0, recoveredIndexJobs: 0, failures: [] },
    });
  });

  it("enforces exact ChatScope bodies, authorizes every selected resource, and never calls AI on failure", async () => {
    await env.DB.prepare(
      `INSERT INTO spaces (
         id, slug, name, description, kind, status, position, read_only, created_at, updated_at
       ) VALUES ('space-two', 'space-two', 'Space Two', '', 'shared', 'active', 2, 0, ?, ?)`,
    ).bind(now, now).run();
    await env.DB.prepare(
      `INSERT INTO collections (
         id, space_id, parent_id, name, description, status, position, created_at, updated_at
       ) VALUES ('api-chat-collection', 'default', NULL, 'API chat', '', 'active', 1, ?, ?)`,
    ).bind(now, now).run();
    const collection = await publishSubmission(
      "contributor", "Scoped collection", "scopedmarker collection evidence", "shared", "scope-collection1",
    );
    const uncollected = await publishSubmission(
      "contributor", "Scoped default", "scopedmarker default evidence", "shared", "scope-default-key1",
    );
    const secondSpace = await publishSubmission(
      "other", "Scoped second Space", "scopedmarker second Space evidence", "shared", "scope-second-key01",
    );
    await env.DB.batch([
      env.DB.prepare("UPDATE knowledge_items SET collection_id = 'api-chat-collection' WHERE id = ?")
        .bind(collection.knowledgeItemId),
      env.DB.prepare("UPDATE knowledge_items SET space_id = 'space-two' WHERE id = ?")
        .bind(secondSpace.knowledgeItemId),
    ]);

    const ask = async (scope: unknown) => {
      const response = await memberApi("contributor", "/api/knowledge/chat", {
        method: "POST",
        body: JSON.stringify({ question: "scopedmarker", scope }),
      });
      expect(response.status).toBe(200);
      return response.json<{
        citations: string[];
        sources: Array<{ knowledgeItemId: string }>;
        evidenceConfidence: number;
      }>();
    };
    const ids = (result: Awaited<ReturnType<typeof ask>>) => (
      result.sources.map((source) => source.knowledgeItemId).sort()
    );

    expect(ids(await ask({ kind: "all" }))).toEqual([
      collection.knowledgeItemId, secondSpace.knowledgeItemId, uncollected.knowledgeItemId,
    ].sort());
    expect(ids(await ask({ kind: "space", spaceId: "default" }))).toEqual([
      collection.knowledgeItemId, uncollected.knowledgeItemId,
    ].sort());
    expect(ids(await ask({ kind: "collection", collectionId: "api-chat-collection" })))
      .toEqual([collection.knowledgeItemId]);
    expect(ids(await ask({
      kind: "items",
      knowledgeItemIds: [secondSpace.knowledgeItemId, uncollected.knowledgeItemId],
    }))).toEqual([secondSpace.knowledgeItemId, uncollected.knowledgeItemId].sort());
    expect(fakeAiCalls).toBe(4);

    for (const body of [
      { question: "scopedmarker" },
      { question: "scopedmarker", scope: { kind: "all", spaceId: "default" } },
      { question: "scopedmarker", scope: { kind: "items", knowledgeItemIds: [] } },
      { question: "scopedmarker", scope: { kind: "items", knowledgeItemIds: [uncollected.knowledgeItemId, uncollected.knowledgeItemId] } },
      { question: "scopedmarker", scope: { kind: "items", knowledgeItemIds: Array.from({ length: 9 }, (_, index) => `knowledge-${index}`) } },
    ]) {
      await expectApiError(memberApi("contributor", "/api/knowledge/chat", {
        method: "POST", body: JSON.stringify(body),
      }), 400, "KNOWLEDGE_CHAT_REQUEST_INVALID");
    }
    expect(fakeAiCalls).toBe(4);

    const hidden = await publishSubmission(
      "other", "Hidden scoped", "scopedmarker hidden evidence", "admin_only", "scope-hidden-key01",
    );
    const beforeDenied = fakeAiCalls;
    await expectApiError(memberApi("contributor", "/api/knowledge/chat", {
      method: "POST",
      body: JSON.stringify({
        question: "scopedmarker",
        scope: {
          kind: "items",
          knowledgeItemIds: [uncollected.knowledgeItemId, hidden.knowledgeItemId],
        },
      }),
    }), 404, "KNOWLEDGE_CHAT_SCOPE_NOT_FOUND");
    await env.DB.prepare("UPDATE knowledge_items SET search_status = 'pending' WHERE id = ?")
      .bind(uncollected.knowledgeItemId).run();
    await expectApiError(memberApi("contributor", "/api/knowledge/chat", {
      method: "POST",
      body: JSON.stringify({
        question: "scopedmarker",
        scope: { kind: "items", knowledgeItemIds: [uncollected.knowledgeItemId] },
      }),
    }), 404, "KNOWLEDGE_CHAT_SCOPE_NOT_FOUND");
    await env.DB.prepare("UPDATE collections SET status = 'disabled' WHERE id = 'api-chat-collection'").run();
    await expectApiError(memberApi("contributor", "/api/knowledge/chat", {
      method: "POST",
      body: JSON.stringify({
        question: "scopedmarker",
        scope: { kind: "items", knowledgeItemIds: [collection.knowledgeItemId] },
      }),
    }), 404, "KNOWLEDGE_CHAT_SCOPE_NOT_FOUND");
    expect(fakeAiCalls).toBe(beforeDenied);
  });

  it("refuses weak scoped evidence below 0.60 with stable action keys and zero AI calls", async () => {
    const weak = await publishSubmission(
      "contributor",
      "General handbook",
      `launch ${"generic policy filler ".repeat(24)}latency`,
      "shared",
      "scope-weak-key001",
    );
    const callsBefore = fakeAiCalls;

    const response = await memberApi("contributor", "/api/knowledge/chat", {
      method: "POST",
      body: JSON.stringify({
        question: "launch latency",
        scope: { kind: "items", knowledgeItemIds: [weak.knowledgeItemId] },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      answer: "知识库中没有足够依据回答这个问题。",
      citations: [],
      sources: [],
      evidenceConfidence: 0.325,
      messageKey: "KNOWLEDGE_EVIDENCE_INSUFFICIENT",
      suggestedActionKeys: [
        "KNOWLEDGE_CHAT_REWRITE_QUESTION",
        "KNOWLEDGE_CHAT_EXPAND_SCOPE",
      ],
    });
    expect(fakeAiCalls).toBe(callsBefore);
  });

  it("keeps invisible resources indistinguishable and reports degraded search without breaking reads", async () => {
    const shared = await publishSubmission("contributor", "Shared degraded", "launch degraded evidence", "shared", "shared-degraded01");
    const hidden = await publishSubmission("other", "Hidden policy", "secret policy evidence", "admin_only", "hidden-policy-key1");

    const adminSearch = await memberApi("admin", "/api/knowledge/search?q=secret%20policy");
    const hiddenHit = (await adminSearch.json<{ items: Array<{ citationId: string }> }>()).items[0]!;
    for (const path of [
      `/api/knowledge/${hidden.knowledgeItemId}`,
      `/api/knowledge/${hidden.knowledgeItemId}/revisions/${hidden.id}`,
      `/api/knowledge/${hidden.knowledgeItemId}/revisions/${hidden.id}/download`,
      `/api/knowledge/citations/${encodeURIComponent(hiddenHit.citationId)}`,
      "/api/knowledge/absent-item",
    ]) {
      await expectApiError(memberApi("contributor", path), 404, "KNOWLEDGE_NOT_FOUND");
    }
    const adminDownload = await memberApi(
      "admin",
      `/api/knowledge/${hidden.knowledgeItemId}/revisions/${hidden.id}/download`,
    );
    expect(adminDownload.status).toBe(200);
    await expect(adminDownload.text()).resolves.toBe("secret policy evidence");
    await expectApiError(memberApi(
      "contributor",
      `/api/knowledge/${shared.knowledgeItemId}/revisions/${hidden.id}/download`,
    ), 404, "KNOWLEDGE_NOT_FOUND");
    await expectApiError(memberApi(
      "disabled",
      `/api/knowledge/${shared.knowledgeItemId}/revisions/${shared.id}/download`,
    ), 403, "MEMBER_DISABLED");

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

  it("allows an active target patch and rejects a cross-Space Collection", async () => {
    await env.DB.prepare(
      `INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at)
       VALUES ('other-space', 'other-space', 'Other Space', '', 'shared', 'active', 2, 0, ?, ?)`,
    ).bind(now, now).run();
    await env.DB.prepare(
      `INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at)
       VALUES ('other-collection', 'default', NULL, 'Other Collection', '', 'active', 1, ?, ?)`,
    ).bind(now, now).run();
    const created = await createSubmission("contributor", {
      requestedSpaceId: "default",
      kind: "markdown",
      title: "Fixed target",
      content: "# Fixed target\n",
    }, "fixed-target-key1");

    const patched = await memberApi("admin", `/api/admin/submissions/${created.body.submission.id}/publish`, {
      method: "POST",
      body: JSON.stringify({
        title: "Fixed target", visibility: "shared", spaceId: "other-space", collectionId: null, tagIds: [],
      }),
    });
    expect(patched.status).toBe(200);

    const invalid = await createSubmission("contributor", {
      requestedSpaceId: "default", kind: "markdown", title: "Cross-space", content: "# Cross-space\n",
    }, "cross-space-key01");
    await expectApiError(memberApi("admin", `/api/admin/submissions/${invalid.body.submission.id}/publish`, {
      method: "POST",
      body: JSON.stringify({
        title: "Cross-space", visibility: "shared", spaceId: "other-space",
        collectionId: "other-collection", tagIds: [],
      }),
    }), 400, "PUBLICATION_TARGET_INVALID");
  });

  it("previews and publishes the exact requested target even when generic Space and Collection page one omit it", async () => {
    for (let index = 0; index < 55; index += 1) {
      const suffix = String(index).padStart(2, "0");
      await env.DB.prepare(
        `INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at)
         VALUES (?, ?, ?, '', 'shared', 'active', ?, 0, ?, ?)`,
      ).bind(`filler-space-${suffix}`, `filler-space-${suffix}`, `Filler Space ${suffix}`, index + 10, now, now).run();
    }
    await env.DB.prepare(
      `INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at)
       VALUES ('requested-space-51', 'requested-space', 'Requested Space', '', 'shared', 'active', 10000, 0, ?, ?)`,
    ).bind(now, now).run();
    for (let index = 0; index < 55; index += 1) {
      const suffix = String(index).padStart(2, "0");
      await env.DB.prepare(
        `INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at)
         VALUES (?, 'requested-space-51', NULL, ?, '', 'active', ?, ?, ?)`,
      ).bind(`filler-collection-${suffix}`, `Filler Collection ${suffix}`, index, now, now).run();
    }
    await env.DB.prepare(
      `INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at)
       VALUES ('requested-collection-51', 'requested-space-51', NULL, 'Requested Collection', '', 'active', 10000, ?, ?)`,
    ).bind(now, now).run();

    const genericSpaces = await memberApi("admin", "/api/spaces?limit=50");
    const genericSpacePage = await genericSpaces.json<{ items: Array<{ id: string }> }>();
    expect(genericSpacePage.items.map(({ id }) => id)).not.toContain("requested-space-51");
    const genericCollections = await memberApi("admin", "/api/spaces/requested-space-51/collections?limit=50");
    const genericCollectionPage = await genericCollections.json<{ items: Array<{ id: string }> }>();
    expect(genericCollectionPage.items.map(({ id }) => id)).not.toContain("requested-collection-51");

    const created = await createSubmission("contributor", {
      requestedSpaceId: "requested-space-51",
      requestedCollectionId: "requested-collection-51",
      kind: "markdown",
      title: "Late-page target",
      content: "# Late-page target\n",
    }, "late-page-target1");
    const previewResponse = await memberApi("admin", `/api/admin/submissions/${created.body.submission.id}`);
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json<{ preview: { requestedTarget: unknown } }>();
    expect(preview.preview.requestedTarget).toEqual({
      space: { id: "requested-space-51", slug: "requested-space", name: "Requested Space", status: "active" },
      collection: { id: "requested-collection-51", name: "Requested Collection", status: "active" },
      available: true,
    });
    expect(JSON.stringify(preview.preview.requestedTarget)).not.toMatch(/description|position|readOnly|kind|path|hash/iu);

    const publish = await memberApi("admin", `/api/admin/submissions/${created.body.submission.id}/publish`, {
      method: "POST",
      body: JSON.stringify({
        title: "Late-page target",
        visibility: "shared",
        spaceId: "requested-space-51",
        collectionId: "requested-collection-51",
        tagIds: [],
      }),
    });
    expect(publish.status).toBe(200);
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
  input: { requestedSpaceId: string; requestedCollectionId?: string | null; requestedVisibility?: "shared" | "admin_only"; kind: "text" | "markdown" | "code"; title: string; content: string },
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

async function advanceCurrentRevision(
  knowledgeItemId: string,
  visibility: "shared" | "admin_only" = "shared",
): Promise<void> {
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
    "INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES (?, ?, ?, ?, ?, 'History', '[]', ?, 'member-admin', ?)",
  ).bind(
    revisionId,
    knowledgeItemId,
    sourceVersionId,
    `/workspace/published/default/${knowledgeItemId}/${revisionId}.md`,
    hash,
    visibility,
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

async function resubmissionSideEffectCounts(priorSubmissionId: string): Promise<{
  submissions: number; sources: number; versions: number; audits: number;
}> {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT count(*) FROM submissions child WHERE child.supersedes_submission_id = ?) AS submissions,
       (SELECT count(*) FROM sources source WHERE source.id IN (
         SELECT version.source_id FROM source_versions version
         JOIN submissions child ON child.id = version.submission_id
         WHERE child.supersedes_submission_id = ?
       )) AS sources,
       (SELECT count(*) FROM source_versions version
         JOIN submissions child ON child.id = version.submission_id
         WHERE child.supersedes_submission_id = ?) AS versions,
       (SELECT count(*) FROM audit_events
         WHERE action = 'submission.resubmitted'
           AND json_extract(metadata, '$.supersedesSubmissionId') = ?) AS audits`,
  ).bind(priorSubmissionId, priorSubmissionId, priorSubmissionId, priorSubmissionId).first<{
    submissions: number; sources: number; versions: number; audits: number;
  }>();
  if (!row) throw new Error("missing resubmission side-effect counts");
  return row;
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
