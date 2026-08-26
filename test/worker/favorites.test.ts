/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = "2026-08-26T00:00:00.000Z";

describe("knowledge favorites", () => {
  let sessionA = "";
  let sessionB = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await seedKnowledge();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => new Date(NOW) });
    sessionA = (await sessions.create((await members.findByIdentitySubject("subject-favorite-a"))!)).token;
    sessionB = (await sessions.create((await members.findByIdentitySubject("subject-favorite-b"))!)).token;
  });

  it("keeps favorites private, visible only for readable knowledge, and removable", async () => {
    const added = await api("/api/knowledge/knowledge-favorite/favorite", sessionA, { method: "PUT" });
    expect(added.status).toBe(201);
    expect(await added.json()).toMatchObject({ favorite: { knowledgeItemId: "knowledge-favorite", completed: false } });
    await expect((await api("/api/knowledge/knowledge-favorite/favorite", sessionA)).json()).resolves.toEqual({ favorite: true });
    await expect((await api("/api/knowledge/favorites?limit=20", sessionA)).json()).resolves.toMatchObject({ items: [{ knowledgeItemId: "knowledge-favorite" }] });
    await env.DB.prepare("INSERT INTO knowledge_visits (member_id, knowledge_item_id, last_visited_at, visit_count) VALUES ('favorite-a', 'knowledge-favorite', ?, 1)").bind("2026-08-27T00:00:00.000Z").run();
    await expect((await api("/api/knowledge/favorites?limit=20", sessionA)).json()).resolves.toMatchObject({ items: [{ knowledgeItemId: "knowledge-favorite", completed: true }] });
    await expect((await api("/api/knowledge/knowledge-favorite/favorite", sessionB)).json()).resolves.toEqual({ favorite: false });
    expect((await api("/api/knowledge/knowledge-favorite/favorite", sessionB, { method: "PUT" })).status).toBe(201);
    expect((await api("/api/knowledge/knowledge-favorite/favorite", sessionA, { method: "DELETE" })).status).toBe(204);
  });

  it("cascades a member deletion without affecting another member's private edge", async () => {
    await api("/api/knowledge/knowledge-favorite/favorite", sessionA, { method: "PUT" });
    await api("/api/knowledge/knowledge-favorite/favorite", sessionB, { method: "PUT" });
    await env.DB.prepare("DELETE FROM knowledge_favorites WHERE member_id = 'favorite-b'").run();
    await expect(env.DB.prepare("SELECT member_id FROM knowledge_favorites ORDER BY member_id").all()).resolves.toMatchObject({ results: [{ member_id: "favorite-a" }] });
  });
});

async function api(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("cookie", `__Host-memory-session=${token}`);
  headers.set("origin", "https://memory.crgmhrc.asia");
  headers.set("content-type", "application/json");
  const context = createExecutionContext();
  const response = await createApp().fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { ...init, headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}

async function seedKnowledge(): Promise<void> {
  const hash = "b".repeat(64);
  await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('favorite-a', 'subject-favorite-a', 'favorite-a@example.test', 'contributor', 'active', ?, ?), ('favorite-b', 'subject-favorite-b', 'favorite-b@example.test', 'contributor', 'active', ?, ?)").bind(NOW, NOW, NOW, NOW).run();
  await env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, kind, status, title, content, created_at, updated_at) VALUES ('favorite-submission', 'favorite-a', 'default', 'markdown', 'published', 'Favorite Guide', '# Favorite Guide', ?, ?)").bind(NOW, NOW).run();
  await env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, kind, title, created_at, updated_at) VALUES ('favorite-source', 'favorite-a', 'default', 'markdown', 'Favorite Guide', ?, ?)").bind(NOW, NOW).run();
  await env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('favorite-source-version', 'favorite-source', 'favorite-submission', 1, '# Favorite Guide', ?, 'm1-v1', ?)").bind(hash, NOW).run();
  await env.DB.prepare("INSERT INTO knowledge_items (id, space_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('knowledge-favorite', 'default', NULL, 'active', 'indexed', ?, ?)").bind(NOW, NOW).run();
  await env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES ('favorite-revision', 'knowledge-favorite', 'favorite-source-version', '/workspace/published/default/knowledge-favorite/revision.md', ?, 'Favorite Guide', '[]', 'shared', 'favorite-a', ?)").bind(hash, NOW).run();
  await env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'favorite-revision' WHERE id = 'knowledge-favorite'").run();
}
