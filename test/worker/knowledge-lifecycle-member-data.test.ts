/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import type { KnowledgeBase } from "../../src/index";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import type { RpcResult } from "../../src/knowledge/types";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = "2026-08-26T00:00:00.000Z";
const TRASHED_AT = "2026-06-01T00:00:00.000Z";
const ITEM = "knowledge-1";
const FAVORITE_ADD = "lifecycle-favorite-add";
const FAVORITE_REMOVE = "lifecycle-favorite-remove-while-trashed";

interface KnowledgeBody { knowledge: { id: string; status: string; revisionId: string } }
interface NoteBody { note: { id: string; title: string; body: string; updatedAt: string; access: string } | null }
interface FavoriteBody { favorite: boolean }
interface FavoriteListBody { items: Array<{ knowledgeItemId: string }> }
interface OperationBody { operation: { operationId: string; favorited: boolean } }
interface PurgeBody { purge: { knowledgeItemId: string; status: string; purgedRevisionCount: number } }
interface ErrorBody { error: { code: string; status: number } }

describe("member data across the knowledge lifecycle", () => {
  let member = "";
  let recipient = "";
  let admin = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await seedKnowledge();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
    member = (await sessions.create((await members.findById("member-a"))!)).token;
    recipient = (await sessions.create((await members.findById("member-b"))!)).token;
    admin = (await sessions.create((await members.findById("admin-1"))!)).token;
  });

  it("keeps every member-scoped relation across trash and restore and refuses a write that would destroy one", async () => {
    await seedMemberRelations(member);

    // The member's own surfaces before the administrator touches the item.
    const noteBefore = await note(member);
    expect(noteBefore).toMatchObject({ title: "Key idea", body: "Keep this private", access: "owner" });
    expect(await note(recipient)).toMatchObject({ title: "Key idea", access: "shared" });
    expect(await favoriteIds(member)).toEqual([ITEM]);
    expect(await recentIds(member)).toEqual([ITEM]);
    expect(await path(member, `/api/knowledge/${ITEM}/favorite`)).toEqual({ favorite: true });

    const trashed = await api(admin, `/api/admin/knowledge/${ITEM}/trash`, {
      method: "POST", body: JSON.stringify({ operationId: "lifecycle-trash-1" }),
    });
    expect(trashed.status).toBe(200);
    // The recycle bin is a state, never a delete: the row is still there.
    expect(await count("SELECT COUNT(*) AS count FROM knowledge_items WHERE id = ? AND status = 'trashed'", ITEM)).toBe(1);
    expect(await note(member)).toBeNull();
    expect(await note(recipient)).toBeNull();
    expect(await favoriteIds(member)).toEqual([]);
    expect(await recentIds(member)).toEqual([]);

    // A trashed item is unreadable, so its member-scoped edges are not writable:
    // the member's client cannot turn the hidden item into a destroyed edge that
    // the restore would then have to bring back from nothing.
    const removedWhileTrashed = await api(member, `/api/knowledge/${ITEM}/favorite`, {
      method: "DELETE", body: JSON.stringify({ operationId: FAVORITE_REMOVE }),
    });
    expect(removedWhileTrashed.status).toBe(404);
    expect((await removedWhileTrashed.json<ErrorBody>()).error.code).toBe("FAVORITE_NOT_FOUND");
    // Nothing was destroyed while the item sat in the recycle bin.
    for (const relation of RELATIONS) {
      expect(await count(`SELECT COUNT(*) AS count FROM ${relation} WHERE knowledge_item_id = ?`, ITEM)).toBe(1);
    }
    expect(await count("SELECT COUNT(*) AS count FROM private_note_shares")).toBe(1);
    expect(await count("SELECT COUNT(*) AS count FROM discussion_thread_access WHERE principal_kind = 'knowledge'")).toBe(0);

    const restored = await api(admin, `/api/admin/knowledge/${ITEM}/restore`, {
      method: "POST", body: JSON.stringify({ operationId: "lifecycle-restore-1" }),
    });
    expect(restored.status).toBe(200);
    expect((await restored.json<KnowledgeBody>()).knowledge).toMatchObject({ id: ITEM, status: "active" });

    // Every relation comes back exactly as it was: same note identity and body,
    // the recipient's share, the favorite edge, the visit, the task link, the
    // research run and the conversation's access projection.
    expect(await note(member)).toEqual(noteBefore);
    expect(await note(recipient)).toMatchObject({ title: "Key idea", access: "shared" });
    expect(await favoriteIds(member)).toEqual([ITEM]);
    expect(await recentIds(member)).toEqual([ITEM]);
    expect(await path(member, `/api/knowledge/${ITEM}/favorite`)).toEqual({ favorite: true });
    for (const relation of RELATIONS) {
      expect(await count(`SELECT COUNT(*) AS count FROM ${relation} WHERE knowledge_item_id = ?`, ITEM)).toBe(1);
    }
    expect(await count("SELECT COUNT(*) AS count FROM private_note_shares")).toBe(1);
    expect(await count("SELECT COUNT(*) AS count FROM discussion_thread_access WHERE principal_kind = 'knowledge'")).toBe(2);
    const linked = await api(member, "/api/tasks/probe-task");
    expect(linked.status).toBe(200);
    expect((await linked.json<{ links: Array<{ knowledgeItemId: string }> }>()).links.map((link) => link.knowledgeItemId)).toEqual([ITEM]);
  });

  it("purges every member-scoped relation and stays irreversible", async () => {
    await seedMemberRelations(member);
    expect((await api(admin, `/api/admin/knowledge/${ITEM}/trash`, {
      method: "POST", body: JSON.stringify({ operationId: "lifecycle-purge-trash" }),
    })).status).toBe(200);
    await env.DB.prepare("UPDATE knowledge_items SET updated_at = ? WHERE id = ?").bind(TRASHED_AT, ITEM).run();

    const purged = await api(admin, `/api/admin/knowledge/${ITEM}/purge`, {
      method: "POST", body: JSON.stringify({ confirm: ITEM, operationId: "lifecycle-purge-1" }),
    });
    expect(purged.status).toBe(200);
    expect((await purged.json<PurgeBody>()).purge).toMatchObject({
      knowledgeItemId: ITEM, status: "purged", purgedRevisionCount: 1,
    });

    // The documented irreversible path destroys the member-scoped relations with
    // the item instead of aborting on them or stranding them.
    for (const relation of RELATIONS) {
      expect(await count(`SELECT COUNT(*) AS count FROM ${relation} WHERE knowledge_item_id = ?`, ITEM)).toBe(0);
    }
    expect(await count("SELECT COUNT(*) AS count FROM private_note_shares")).toBe(0);
    expect(await count("SELECT COUNT(*) AS count FROM research_queries")).toBe(0);
    expect(await count("SELECT COUNT(*) AS count FROM research_reports")).toBe(0);
    expect(await count("SELECT COUNT(*) AS count FROM knowledge_items WHERE id = ?", ITEM)).toBe(0);
    expect(await count("SELECT COUNT(*) AS count FROM revisions WHERE knowledge_item_id = ?", ITEM)).toBe(0);
    // The member's own task and the recorded conversation survive: a purge
    // reclaims the item and the data attached to it, not the member's work.
    expect(await count("SELECT COUNT(*) AS count FROM tasks WHERE id = 'probe-task'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS count FROM discussion_threads WHERE id = 'probe-thread'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS count FROM discussion_thread_access WHERE principal_kind = 'knowledge'")).toBe(0);
    // The operation journal outlives the item, so a retried purge still answers
    // from its receipt and the audit tombstone records the destruction.
    expect(await count("SELECT COUNT(*) AS count FROM knowledge_lifecycle_operation_receipts WHERE knowledge_item_id = ?", ITEM)).toBe(2);
    expect(await count("SELECT COUNT(*) AS count FROM audit_events WHERE resource_id = ? AND action = 'knowledge.purged'", ITEM)).toBe(1);
    expect(await path(member, `/api/knowledge/favorites/operations/${FAVORITE_ADD}`)).toMatchObject({
      operation: { operationId: FAVORITE_ADD, favorited: true },
    });

    // Irreversibility: there is nothing left to restore.
    const restore = await api(admin, `/api/admin/knowledge/${ITEM}/restore`, {
      method: "POST", body: JSON.stringify({ operationId: "lifecycle-purge-restore" }),
    });
    expect(restore.status).toBe(400);
    expect((await restore.json<ErrorBody>()).error.code).toBe("KNOWLEDGE_LIFECYCLE_TARGET_INVALID");
  });
});

const RELATIONS = ["private_notes", "knowledge_favorites", "knowledge_visits", "task_links", "research_runs"] as const;

async function seedMemberRelations(token: string): Promise<void> {
  const saved = await api(token, `/api/knowledge/${ITEM}/note`, {
    method: "PUT",
    body: JSON.stringify({
      title: "Key idea", body: "Keep this private",
      citations: [{ revisionId: "revision-1", chunkId: "chunk-1", startLine: 3, endLine: 3 }],
    }),
  });
  expect(saved.status).toBe(200);
  const shared = await api(token, `/api/knowledge/${ITEM}/note/shares`, {
    method: "POST", body: JSON.stringify({ recipientMemberId: "member-b" }),
  });
  expect(shared.status).toBe(201);
  const favorited = await api(token, `/api/knowledge/${ITEM}/favorite`, {
    method: "PUT", body: JSON.stringify({ operationId: FAVORITE_ADD }),
  });
  expect(favorited.status).toBe(201);
  const visited = await api(token, `/api/knowledge/${ITEM}`, { headers: { "x-visit-id": "lifecycle-visit-1" } });
  expect(visited.status).toBe(200);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at) VALUES ('probe-task', 'member-a', 'Probe', '', 'todo', 0, 'medium', NULL, ?, ?)").bind(Date.parse(NOW), Date.parse(NOW)),
    env.DB.prepare("INSERT INTO task_links (id, task_id, member_id, knowledge_item_id, created_at) VALUES ('probe-link', 'probe-task', 'member-a', ?, ?)").bind(ITEM, Date.parse(NOW)),
    env.DB.prepare("INSERT INTO research_runs (id, owner_member_id, knowledge_item_id, goal, status, created_at, updated_at) VALUES ('probe-run', 'member-a', ?, 'Probe goal', 'draft', ?, ?)").bind(ITEM, NOW, NOW),
    env.DB.prepare("INSERT INTO research_queries (id, research_run_id, subquestion_id, query, result_ids_json, rationale, created_at) VALUES ('probe-query', 'probe-run', 'q1', 'probe query', '[]', 'because', ?)").bind(NOW),
    env.DB.prepare("INSERT INTO research_reports (id, research_run_id, version, title, sections_json, source_snapshots_json, model, prompt_version, created_at) VALUES ('probe-report', 'probe-run', 1, 'Probe report', '[]', '[]', 'test-model', 'v1', ?)").bind(NOW),
    env.DB.prepare("INSERT INTO discussion_threads (id, context_kind, context_id, creator_member_id, last_sequence, created_at, updated_at) VALUES ('probe-thread', 'knowledge', ?, 'member-a', 0, ?, ?)").bind(ITEM, Date.parse(NOW), Date.parse(NOW)),
  ]);
  expect(await count("SELECT COUNT(*) AS count FROM discussion_thread_access WHERE principal_kind = 'knowledge'")).toBe(2);
}

async function note(token: string): Promise<NoteBody["note"]> {
  const response = await api(token, `/api/knowledge/${ITEM}/note`);
  expect(response.status).toBe(200);
  return (await response.json<NoteBody>()).note;
}

async function favoriteIds(token: string): Promise<string[]> {
  const list = await path<FavoriteListBody>(token, "/api/knowledge/favorites?limit=20");
  return list.items.map((item) => item.knowledgeItemId);
}

async function recentIds(token: string): Promise<string[]> {
  const list = await path<FavoriteListBody>(token, "/api/knowledge/recent?limit=20");
  return list.items.map((item) => item.knowledgeItemId);
}

async function path<T>(token: string, url: string): Promise<T> {
  const response = await api(token, url);
  expect(response.status).toBe(200);
  return await response.json<T>();
}

async function api(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("origin", "https://memory.crgmhrc.asia");
  headers.set("cookie", `__Host-memory-session=${token}`);
  const request = new Request(`https://memory.crgmhrc.asia${url}`, { ...init, headers });
  const context = createExecutionContext();
  const response = await createApp().fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}

async function count(sql: string, ...bindings: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql).bind(...bindings).first<{ count: number }>();
  return row?.count ?? -1;
}

async function seedKnowledge(): Promise<void> {
  const markdown = "# Guide\n\nPrivate note source\n";
  const hash = await sha256Hex(markdown);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('seed-owner', 'subject-seed-owner', 'seed@example.test', 'contributor', 'active', ?, ?)").bind(NOW, NOW),
    env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-a', 'subject-member-a', 'a@example.test', 'contributor', 'active', ?, ?)").bind(NOW, NOW),
    env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-b', 'subject-member-b', 'b@example.test', 'contributor', 'active', ?, ?)").bind(NOW, NOW),
    env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('admin-1', 'subject-admin-1', 'admin@example.test', 'admin', 'active', ?, ?)").bind(NOW, NOW),
    env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, created_at, updated_at) VALUES ('submission-note-1', 'seed-owner', 'default', NULL, 'markdown', 'published', 'Guide', ?, ?, ?)").bind(markdown, NOW, NOW),
    env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES ('source-note-1', 'seed-owner', 'default', NULL, 'markdown', 'Guide', ?, ?)").bind(NOW, NOW),
    env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('source-version-1', 'source-note-1', 'submission-note-1', 1, ?, ?, 'm1-v1', ?)").bind(markdown, hash, NOW),
    env.DB.prepare("INSERT INTO knowledge_items (id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at) VALUES (?, 'default', NULL, NULL, 'active', 'indexed', ?, ?)").bind(ITEM, NOW, NOW),
    env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES ('revision-1', ?, 'source-version-1', '/workspace/published/default/knowledge-1/revision-1.md', ?, 'Guide', '[]', 'shared', 'seed-owner', ?)").bind(ITEM, hash, NOW),
    env.DB.prepare("INSERT INTO chunks (id, revision_id, ordinal, heading_path, start_line, end_line, body, search_title, search_tags, search_body) VALUES ('chunk-1', 'revision-1', 0, '[\"Guide\"]', 3, 3, 'Private note source', 'Guide', '', 'Private note source')"),
    env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'revision-1' WHERE id = ?").bind(ITEM),
  ]);
  const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName("personal")) as DurableObjectStub<KnowledgeBase>;
  const result = await stub.commitPublishedContent({
    spaceId: "default", knowledgeItemId: ITEM, revisionId: "revision-1", contentSha256: hash, markdown,
  }) as RpcResult<unknown>;
  expect(result.ok).toBe(true);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
