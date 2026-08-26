/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { PrivateNotesRepository } from "../../src/private-notes/repository";
import { PrivateNotesService } from "../../src/private-notes/service";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = "2026-08-26T00:00:00.000Z";

describe("private knowledge notes", () => {
  let sessionA = "";
  let sessionB = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await seedKnowledge();
    const members = new MembersRepository(env.DB);
    await seedMember("member-a", "a@example.test", "contributor");
    await seedMember("member-b", "b@example.test", "contributor");
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => new Date(NOW) });
    sessionA = (await sessions.create((await members.findByIdentitySubject("subject-member-a"))!)).token;
    sessionB = (await sessions.create((await members.findByIdentitySubject("subject-member-b"))!)).token;
  });

  it("persists owner-only notes through the API and accepts only readable citations", async () => {
    const created = await api("/api/knowledge/knowledge-1/note", sessionA, {
      method: "PUT",
      body: JSON.stringify({ title: "Key idea", body: "Keep this private", citations: [{ revisionId: "revision-1", chunkId: "chunk-1", startLine: 2, endLine: 4 }] }),
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ note: { ownerId: "member-a", knowledgeItemId: "knowledge-1", visibility: "private", citations: [{ chunkId: "chunk-1" }] } });
    expect((await api("/api/knowledge/knowledge-1/note", sessionB)).status).toBe(200);
    expect(await (await api("/api/knowledge/knowledge-1/note", sessionB)).json()).toEqual({ note: null });
    const forbiddenCitation = await api("/api/knowledge/knowledge-1/note", sessionB, {
      method: "PUT",
      body: JSON.stringify({ title: "No", body: "No", citations: [{ revisionId: "revision-1", chunkId: "chunk-1", startLine: 2, endLine: 4 }] }),
    });
    expect(forbiddenCitation.status).toBe(200);
    expect(await forbiddenCitation.json()).toMatchObject({ note: { ownerId: "member-b" } });
    const crossKnowledge = await api("/api/knowledge/knowledge-2/note", sessionA, {
      method: "PUT",
      body: JSON.stringify({ title: "Wrong", body: "Wrong", citations: [{ revisionId: "revision-1", chunkId: "chunk-1", startLine: 2, endLine: 4 }] }),
    });
    expect(crossKnowledge.status).toBe(404);
    const loaded = await api("/api/knowledge/knowledge-1/note", sessionA);
    expect(await loaded.json()).toMatchObject({ note: { title: "Key idea", body: "Keep this private" } });
    const listed = await api("/api/knowledge/notes?limit=8", sessionA);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({ items: [expect.objectContaining({ id: expect.any(String), knowledgeItemId: "knowledge-1", title: "Key idea", visibility: "private" })] });
    const otherList = await api("/api/knowledge/notes?limit=8", sessionB);
    expect(otherList.status).toBe(200);
    expect((await otherList.json() as { items: Array<{ knowledgeItemId: string }> }).items.map((item) => item.knowledgeItemId)).toEqual(["knowledge-1"]);
  });

  it("keeps malformed note input outside the publication path", async () => {
    const response = await api("/api/knowledge/knowledge-1/note", sessionA, {
      method: "PUT",
      body: JSON.stringify({ title: "", body: "", citations: [] }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "PRIVATE_NOTE_INVALID" } });
    await expect(env.DB.prepare("SELECT count(*) AS count FROM private_notes").first()).resolves.toMatchObject({ count: 0 });
  });

  it("keeps the repository owner boundary when read directly", async () => {
    const service = new PrivateNotesService(new PrivateNotesRepository(env.DB), { id: () => "note-direct", now: () => new Date(NOW) });
    await service.save({ memberId: "member-a", role: "contributor" }, "knowledge-1", { title: "Direct", body: "Owned", citations: [{ revisionId: "revision-1", chunkId: "chunk-1", startLine: 2, endLine: 4 }] });
    await expect(service.get({ memberId: "member-b", role: "contributor" }, "knowledge-1")).resolves.toBeNull();
  });
});

async function api(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("cookie", `__Host-memory-session=${token}`);
  headers.set("origin", "https://memory.crgmhrc.asia");
  headers.set("content-type", "application/json");
  const request = new Request(`https://memory.crgmhrc.asia${path}`, { ...init, headers });
  const context = createExecutionContext();
  const response = await createApp().fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}

async function seedMember(id: string, email: string, role: "admin" | "contributor"): Promise<void> {
  await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)")
    .bind(id, `subject-${id}`, email, role, NOW, NOW).run();
}

async function seedKnowledge(): Promise<void> {
  const hash = "a".repeat(64);
  await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('seed-owner', 'subject-seed-owner', 'seed@example.test', 'contributor', 'active', ?, ?)").bind(NOW, NOW).run();
  await env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, created_at, updated_at) VALUES ('submission-note-1', 'seed-owner', 'default', NULL, 'markdown', 'published', 'Guide', '# Guide', ?, ?)").bind(NOW, NOW).run();
  await env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES ('source-note-1', 'seed-owner', 'default', NULL, 'markdown', 'Guide', ?, ?)").bind(NOW, NOW).run();
  await env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('source-version-1', 'source-note-1', 'submission-note-1', 1, '# Guide', ?, 'm1-v1', ?)").bind(hash, NOW).run();
  await env.DB.prepare("INSERT INTO knowledge_items (id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('knowledge-1', 'default', NULL, NULL, 'active', 'indexed', ?, ?), ('knowledge-2', 'default', NULL, NULL, 'active', 'indexed', ?, ?)").bind(NOW, NOW, NOW, NOW).run();
  await env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES ('revision-1', 'knowledge-1', 'source-version-1', '/workspace/published/default/knowledge-1/revision-1.md', ?, 'Guide', '[]', 'shared', 'seed-owner', ?)").bind(hash, NOW).run();
  await env.DB.prepare("INSERT INTO chunks (id, revision_id, ordinal, heading_path, start_line, end_line, body, search_title, search_tags, search_body) VALUES ('chunk-1', 'revision-1', 0, '[\"Guide\"]', 2, 4, 'Private note source', 'Guide', '', 'Private note source')").run();
  await env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'revision-1' WHERE id = 'knowledge-1'").run();
}
