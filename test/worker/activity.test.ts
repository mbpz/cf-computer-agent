/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = "2026-08-26T00:00:00.000Z";

describe("member activity feed", () => {
  let contributor = "";
  let other = "";
  let admin = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await seedMembers();
    await seedKnowledge();
    await seedActivity();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => new Date(NOW) });
    contributor = (await sessions.create((await members.findByIdentitySubject("subject-contributor"))!)).token;
    other = (await sessions.create((await members.findByIdentitySubject("subject-other"))!)).token;
    admin = (await sessions.create((await members.findByIdentitySubject("subject-admin"))!)).token;
  });

  it("returns only the caller's own submission activity plus visible shared knowledge", async () => {
    const response = await api("/api/activity?limit=20", contributor);
    expect(response.status).toBe(200);
    const body = await response.json() as { items: Array<Record<string, unknown>>; nextCursor?: string };
    expect(body.items).toEqual([
      expect.objectContaining({ action: "knowledge.published", resourceType: "knowledge", resourceId: "knowledge-1" }),
      expect.objectContaining({ action: "submission.created", resourceType: "submission", resourceId: "submission-a" }),
    ]);
    expect(body.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ resourceId: "submission-other" })]));
    expect(body.items.every((item) => Object.keys(item).sort().join(",") === "action,createdAt,id,resourceId,resourceType")).toBe(true);
  });

  it("applies role visibility and stable cursor pagination", async () => {
    await env.DB.prepare("UPDATE revisions SET visibility = 'admin_only' WHERE id = 'revision-1'").run();
    await env.DB.prepare("INSERT INTO audit_events (id, actor_kind, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, 'member', ?, 'submission.draft_saved', 'submission', ?, ?, ?)")
      .bind("event-draft", "member-contributor", "submission-a", JSON.stringify({ kind: "markdown", requestedSpaceId: "space-activity" }), "2026-08-26T00:00:00.750Z").run();
    const contributorResponse = await api("/api/activity?limit=1", contributor);
    const contributorPage = await contributorResponse.json() as { items: Array<{ action: string }>; nextCursor?: string };
    expect(contributorPage.items).toEqual([{ id: expect.any(String), action: "submission.created", resourceType: "submission", resourceId: "submission-a", createdAt: "2026-08-26T00:00:01.000Z" }]);
    expect(contributorPage.nextCursor).toEqual(expect.any(String));

    const next = await api(`/api/activity?limit=1&cursor=${encodeURIComponent(contributorPage.nextCursor!)}`, contributor);
    expect(await next.json()).toEqual({ items: [{ id: "event-draft", action: "submission.draft_saved", resourceType: "submission", resourceId: "submission-a", createdAt: "2026-08-26T00:00:00.750Z" }] });

    const adminResponse = await api("/api/activity?limit=20", admin);
    expect(await adminResponse.json()).toEqual(expect.objectContaining({
      items: expect.arrayContaining([expect.objectContaining({ action: "knowledge.published", resourceId: "knowledge-1" })]),
    }));
  });

  it("rejects unknown query fields and requires the knowledge read capability", async () => {
    const unknownField = await api("/api/activity?limit=20&actorId=member-a", contributor);
    expect(unknownField.status).toBe(400);
    expect(await unknownField.json()).toMatchObject({ error: { code: "PAGE_INVALID" } });
  });
});

async function api(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("cookie", `__Host-memory-session=${token}`);
  headers.set("origin", "https://memory.crgmhrc.asia");
  const request = new Request(`https://memory.crgmhrc.asia${path}`, { ...init, headers });
  const context = createExecutionContext();
  const response = await createApp().fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}

async function seedMembers(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
      ('member-contributor', 'subject-contributor', 'contributor@example.test', 'contributor', 'active', ?, ?),
      ('member-other', 'subject-other', 'other@example.test', 'contributor', 'active', ?, ?),
      ('member-admin', 'subject-admin', 'admin@example.test', 'admin', 'active', ?, ?)`,
  ).bind(NOW, NOW, NOW, NOW, NOW, NOW).run();
}

async function seedKnowledge(): Promise<void> {
  const hash = "a".repeat(64);
  await env.DB.prepare("INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at) VALUES ('space-activity', 'activity', 'Activity', '', 'shared', 'active', 2, 0, ?, ?)").bind(NOW, NOW).run();
  await env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, created_at, updated_at) VALUES ('submission-a', 'member-contributor', 'space-activity', NULL, 'markdown', 'published', 'A', '# A', ?, ?), ('submission-other', 'member-other', 'space-activity', NULL, 'markdown', 'published', 'Other', '# Other', ?, ?)").bind(NOW, NOW, NOW, NOW).run();
  await env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES ('source-activity', 'member-contributor', 'space-activity', NULL, 'markdown', 'Guide', ?, ?)").bind(NOW, NOW).run();
  await env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('source-version-activity', 'source-activity', 'submission-a', 1, '# Guide', ?, 'm1-v1', ?)").bind(hash, NOW).run();
  await env.DB.prepare("INSERT INTO knowledge_items (id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('knowledge-1', 'space-activity', NULL, NULL, 'active', 'indexed', ?, ?)").bind(NOW, NOW).run();
  await env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES ('revision-1', 'knowledge-1', 'source-version-activity', '/published/knowledge-1.md', ?, 'Guide', '[]', 'shared', 'member-admin', ?)").bind(hash, NOW).run();
  await env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'revision-1' WHERE id = 'knowledge-1'").run();
}

async function seedActivity(): Promise<void> {
  const rows = [
    ["event-knowledge", "member", "member-admin", "knowledge.published", "knowledge", "knowledge-1", { visibility: "shared" }, "2026-08-26T00:00:02.000Z"],
    ["event-own", "member", "member-contributor", "submission.created", "submission", "submission-a", { kind: "markdown", requestedSpaceId: "space-activity" }, "2026-08-26T00:00:01.000Z"],
    ["event-other", "member", "member-other", "submission.created", "submission", "submission-other", { kind: "markdown", requestedSpaceId: "space-activity" }, "2026-08-26T00:00:00.500Z"],
  ] as const;
  for (const [id, actorKind, actorId, action, resourceType, resourceId, metadata, createdAt] of rows) {
    await env.DB.prepare("INSERT INTO audit_events (id, actor_kind, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, actorKind, actorId, action, resourceType, resourceId, JSON.stringify(metadata), createdAt).run();
  }
}
