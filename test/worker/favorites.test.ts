/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = "2026-08-26T00:00:00.000Z";
const favoritePath = "/api/knowledge/knowledge-favorite/favorite";

describe("knowledge favorites", () => {
  let sessionA = "";
  let sessionB = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await seedKnowledge();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
    sessionA = (await sessions.create((await members.findByIdentitySubject("subject-favorite-a"))!)).token;
    sessionB = (await sessions.create((await members.findByIdentitySubject("subject-favorite-b"))!)).token;
  });

  it("keeps favorites private, visible only for readable knowledge, and removable", async () => {
    const added = await api(favoritePath, sessionA, { method: "PUT", body: JSON.stringify({ operationId: "favorite-keep-add" }) });
    expect(added.status).toBe(201);
    expect(await added.json()).toMatchObject({ favorite: { knowledgeItemId: "knowledge-favorite", completed: false } });
    await expect((await api(favoritePath, sessionA)).json()).resolves.toEqual({ favorite: true });
    await expect((await api("/api/knowledge/favorites?limit=20", sessionA)).json()).resolves.toMatchObject({ items: [{ knowledgeItemId: "knowledge-favorite" }] });
    await env.DB.prepare("INSERT INTO knowledge_visits (member_id, knowledge_item_id, last_visited_at, visit_count) VALUES ('favorite-a', 'knowledge-favorite', ?, 1)").bind(new Date(Date.now() + 86_400_000).toISOString()).run();
    await expect((await api("/api/knowledge/favorites?limit=20", sessionA)).json()).resolves.toMatchObject({ items: [{ knowledgeItemId: "knowledge-favorite", completed: true }] });
    await expect((await api(favoritePath, sessionB)).json()).resolves.toEqual({ favorite: false });
    expect((await api(favoritePath, sessionB, { method: "PUT", body: JSON.stringify({ operationId: "favorite-keep-add-b" }) })).status).toBe(201);
    const removed = await api(favoritePath, sessionA, { method: "DELETE", body: JSON.stringify({ operationId: "favorite-keep-remove" }) });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toMatchObject({
      operation: { operationId: "favorite-keep-remove", kind: "knowledge.favorite.remove", knowledgeItemId: "knowledge-favorite", favorited: false },
    });
  });

  it("returns the original receipt for a retried operation number without a second effect", async () => {
    const request = { method: "PUT", body: JSON.stringify({ operationId: "favorite-retry-add" }) };
    const first = await api(favoritePath, sessionA, request);
    expect(first.status).toBe(201);
    const body = await first.json();
    expect(body).toMatchObject({
      favorite: { knowledgeItemId: "knowledge-favorite" },
      operation: { operationId: "favorite-retry-add", kind: "knowledge.favorite.add", knowledgeItemId: "knowledge-favorite", favorited: true },
    });
    const repeated = await api(favoritePath, sessionA, request);
    expect(repeated.status).toBe(201);
    // Identical bytes, including the receipt's original createdAt.
    expect(await repeated.json()).toEqual(body);
    expect(await countRows("knowledge_favorites")).toBe(1);
    expect(await countRows("knowledge_favorite_operation_receipts")).toBe(1);
  });

  it("returns the original removal receipt even when the favorite was already absent", async () => {
    const request = { method: "DELETE", body: JSON.stringify({ operationId: "favorite-absent-remove" }) };
    const first = await api(favoritePath, sessionA, request);
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body).toMatchObject({ operation: { operationId: "favorite-absent-remove", kind: "knowledge.favorite.remove", favorited: false } });
    expect(await (await api(favoritePath, sessionA, request)).json()).toEqual(body);
    expect(await countRows("knowledge_favorites")).toBe(0);
    expect(await countRows("knowledge_favorite_operation_receipts")).toBe(1);
  });

  it("conflicts when an operation number is reused for a different intent", async () => {
    expect((await api(favoritePath, sessionA, { method: "PUT", body: JSON.stringify({ operationId: "favorite-conflict" }) })).status).toBe(201);
    const conflict = await api(favoritePath, sessionA, { method: "DELETE", body: JSON.stringify({ operationId: "favorite-conflict" }) });
    expect(conflict.status).toBe(409);
    const conflictBody = await conflict.json() as { error: { code: string } };
    expect(conflictBody.error.code).toBe("FAVORITE_OPERATION_CONFLICT");
    // The original intent and receipt are untouched by the rejected reuse.
    await expect((await api(favoritePath, sessionA)).json()).resolves.toEqual({ favorite: true });
    expect(await countRows("knowledge_favorite_operation_receipts")).toBe(1);
  });

  it("queries an exact operation receipt independently of the live favorite and of paging", async () => {
    await api(favoritePath, sessionA, { method: "PUT", body: JSON.stringify({ operationId: "favorite-query-add" }) });
    expect((await api(favoritePath, sessionA, { method: "DELETE", body: JSON.stringify({ operationId: "favorite-query-remove" }) })).status).toBe(200);
    // The removal deleted the live edge; the original add receipt still resolves.
    await expect((await api(favoritePath, sessionA)).json()).resolves.toEqual({ favorite: false });
    await expect((await api("/api/knowledge/favorites/operations/favorite-query-add", sessionA)).json()).resolves.toMatchObject({
      operation: { operationId: "favorite-query-add", kind: "knowledge.favorite.add", knowledgeItemId: "knowledge-favorite", favorited: true },
    });
    await expect((await api("/api/knowledge/favorites/operations/favorite-query-remove", sessionA)).json()).resolves.toMatchObject({
      operation: { operationId: "favorite-query-remove", kind: "knowledge.favorite.remove", favorited: false },
    });
  });

  it("scopes operation receipts to the member, rejects unknown numbers, and never pages them", async () => {
    await api(favoritePath, sessionA, { method: "PUT", body: JSON.stringify({ operationId: "favorite-scoped-add" }) });
    const missing = await api("/api/knowledge/favorites/operations/missing-operation", sessionA);
    expect(missing.status).toBe(404);
    const missingBody = await missing.json() as { error: { code: string } };
    expect(missingBody.error.code).toBe("FAVORITE_OPERATION_NOT_FOUND");
    expect((await api("/api/knowledge/favorites/operations/favorite-scoped-add", sessionB)).status).toBe(404);
    expect((await api("/api/knowledge/favorites/operations/favorite-scoped-add?limit=1", sessionA)).status).toBe(400);
    expect((await api("/api/knowledge/favorites/operations/favorite-scoped-add", sessionA, { method: "POST" })).status).toBe(405);
    expect((await api("/api/knowledge/favorites/operations/favorite-scoped-add", sessionA)).status).toBe(200);
  });

  it("keeps one operation namespace per member so another member may reuse a number", async () => {
    expect((await api(favoritePath, sessionA, { method: "PUT", body: JSON.stringify({ operationId: "favorite-shared-number" }) })).status).toBe(201);
    expect((await api(favoritePath, sessionB, { method: "PUT", body: JSON.stringify({ operationId: "favorite-shared-number" }) })).status).toBe(201);
    await expect((await api("/api/knowledge/favorites/operations/favorite-shared-number", sessionB)).json()).resolves.toMatchObject({ operation: { operationId: "favorite-shared-number", favorited: true } });
    await expect((await api("/api/knowledge/favorites/operations/favorite-shared-number", sessionA)).json()).resolves.toMatchObject({ operation: { operationId: "favorite-shared-number", favorited: true } });
    expect(await countRows("knowledge_favorites")).toBe(2);
    expect(await countRows("knowledge_favorite_operation_receipts")).toBe(2);
  });

  it("rejects malformed writes and an unreadable add without recording operations", async () => {
    for (const body of [{}, { operationId: "" }, { operationId: "not a valid id" }, { operationId: "favorite-bad-extra", extra: true }, { operationId: 7 }]) {
      expect((await api(favoritePath, sessionA, { method: "PUT", body: JSON.stringify(body) })).status).toBe(400);
      expect((await api(favoritePath, sessionA, { method: "DELETE", body: JSON.stringify(body) })).status).toBe(400);
    }
    expect((await api("/api/knowledge/knowledge-missing/favorite", sessionA, { method: "PUT", body: JSON.stringify({ operationId: "favorite-missing" }) })).status).toBe(404);
    expect(await countRows("knowledge_favorites")).toBe(0);
    expect(await countRows("knowledge_favorite_operation_receipts")).toBe(0);
  });

  it("replays a recorded operation number without reading live state", async () => {
    const addRequest = { method: "PUT", body: JSON.stringify({ operationId: "favorite-replay-add" }) };
    const first = await api(favoritePath, sessionA, addRequest);
    expect(first.status).toBe(201);
    const firstBody = await first.json() as { operation: unknown };
    const removeRequest = { method: "DELETE", body: JSON.stringify({ operationId: "favorite-replay-remove" }) };
    const removed = await api(favoritePath, sessionA, removeRequest);
    expect(removed.status).toBe(200);
    const removedBody = await removed.json() as { operation: unknown };
    await expect((await api(favoritePath, sessionA)).json()).resolves.toEqual({ favorite: false });
    // The live edge is gone, yet the earlier add number still replays its receipt
    // (never 503, never an invented live favorite).
    const replay = await api(favoritePath, sessionA, addRequest);
    expect(replay.status).toBe(201);
    const replayBody = await replay.json() as { favorite?: unknown; operation: unknown };
    expect("favorite" in replayBody).toBe(false);
    expect(replayBody.operation).toEqual(firstBody.operation);
    expect(await countRows("knowledge_favorites")).toBe(0);
    expect(await countRows("knowledge_favorite_operation_receipts")).toBe(2);
    // The removal number stays replay-stable after a later re-add.
    expect((await api(favoritePath, sessionA, { method: "PUT", body: JSON.stringify({ operationId: "favorite-replay-readd" }) })).status).toBe(201);
    await expect((await api(favoritePath, sessionA)).json()).resolves.toEqual({ favorite: true });
    const removalReplay = await api(favoritePath, sessionA, removeRequest);
    expect(removalReplay.status).toBe(200);
    const removalReplayBody = await removalReplay.json() as { operation: unknown };
    expect(removalReplayBody.operation).toEqual(removedBody.operation);
    expect(await countRows("knowledge_favorites")).toBe(1);
    expect(await countRows("knowledge_favorite_operation_receipts")).toBe(3);
  });

  it("refuses an unreadable target before replay is considered, without recording it", async () => {
    expect((await api(favoritePath, sessionA, { method: "PUT", body: JSON.stringify({ operationId: "favorite-before-trash" }) })).status).toBe(201);
    await env.DB.prepare("UPDATE knowledge_items SET status = 'trashed' WHERE id = 'knowledge-favorite'").run();
    // Authorization precedes replay: an unreadable target is refused and nothing
    // new is recorded, so the recorded number is not disclosed either.
    expect((await api(favoritePath, sessionA, { method: "PUT", body: JSON.stringify({ operationId: "favorite-after-trash" }) })).status).toBe(404);
    const replay = await api(favoritePath, sessionA, { method: "PUT", body: JSON.stringify({ operationId: "favorite-before-trash" }) });
    expect(replay.status).toBe(404);
    expect(await countRows("knowledge_favorite_operation_receipts")).toBe(1);
    // Restoring readability resolves the same number from its recorded receipt.
    await env.DB.prepare("UPDATE knowledge_items SET status = 'active' WHERE id = 'knowledge-favorite'").run();
    const resolved = await api(favoritePath, sessionA, { method: "PUT", body: JSON.stringify({ operationId: "favorite-before-trash" }) });
    expect(resolved.status).toBe(201);
    const resolvedBody = await resolved.json() as { operation: unknown };
    expect(resolvedBody.operation).toMatchObject({ operationId: "favorite-before-trash", favorited: true });
    expect(await countRows("knowledge_favorite_operation_receipts")).toBe(1);
  });

  it("cascades a member deletion through favorites and receipts without touching another member", async () => {
    await api(favoritePath, sessionA, { method: "PUT", body: JSON.stringify({ operationId: "favorite-cascade-a" }) });
    // A throwaway member row with its own favorite edge and operation receipt, so
    // the cascade under test is the membership foreign key, not a manual delete.
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('favorite-cascade-owner', 'subject-favorite-cascade-owner', 'favorite-cascade-owner@example.test', 'contributor', 'active', ?, ?)").bind(NOW, NOW).run();
    await env.DB.prepare("INSERT INTO knowledge_favorites (member_id, knowledge_item_id, created_at) VALUES ('favorite-cascade-owner', 'knowledge-favorite', ?)").bind(NOW).run();
    await env.DB.prepare(
      `INSERT INTO knowledge_favorite_operation_receipts
       (member_id, operation_id, kind, request_hash, knowledge_item_id, claim_id, response_json, created_at)
       VALUES ('favorite-cascade-owner', 'favorite-cascade-op', 'knowledge.favorite.add', ?, 'knowledge-favorite', 'favorite-cascade-claim', ?, ?)`,
    ).bind("a".repeat(64), JSON.stringify({ operationId: "favorite-cascade-op", kind: "knowledge.favorite.add", knowledgeItemId: "knowledge-favorite", favorited: true, createdAt: NOW }), NOW).run();
    expect(await countRows("knowledge_favorites", "favorite-cascade-owner")).toBe(1);
    expect(await countRows("knowledge_favorite_operation_receipts", "favorite-cascade-owner")).toBe(1);

    await env.DB.prepare("DELETE FROM members WHERE id = 'favorite-cascade-owner'").run();

    expect(await countRows("knowledge_favorites", "favorite-cascade-owner")).toBe(0);
    expect(await countRows("knowledge_favorite_operation_receipts", "favorite-cascade-owner")).toBe(0);
    // The other member's edge and its receipt are untouched by the cascade.
    expect(await countRows("knowledge_favorites", "favorite-a")).toBe(1);
    expect(await countRows("knowledge_favorite_operation_receipts", "favorite-a")).toBe(1);
    expect(await countRows("knowledge_favorites")).toBe(1);
  });

  async function countRows(table: "knowledge_favorites" | "knowledge_favorite_operation_receipts", memberId?: string): Promise<number> {
    const row = memberId === undefined
      ? await env.DB.prepare(`SELECT count(*) AS count FROM ${table}`).first<{ count: number }>()
      : await env.DB.prepare(`SELECT count(*) AS count FROM ${table} WHERE member_id = ?`).bind(memberId).first<{ count: number }>();
    return row?.count ?? -1;
  }
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
