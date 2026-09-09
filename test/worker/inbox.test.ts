/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";

describe("private Inbox migration contract", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)",
    ).bind(
      "member-a", "subject-a", "a@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
      "member-b", "subject-b", "b@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
    ).run();
  });

  it("creates a member-scoped inbox schema with bounded states and stable pagination index", async () => {
    const table = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'inbox_items'").first<{ sql: string }>();
    expect(table?.sql).toContain("status TEXT NOT NULL");
    expect(table?.sql).toContain("kind TEXT NOT NULL");
    expect(table?.sql).toContain("client_key TEXT NOT NULL");
    expect(table?.sql).toContain("status IN ('inbox', 'archived', 'promoted')");
    const columns = await env.DB.prepare("PRAGMA table_info('inbox_items')").all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).toEqual([
      "id", "member_id", "client_key", "kind", "content", "source_url", "status",
      "promoted_task_id", "promoted_submission_id", "created_at", "updated_at",
    ]);
    const indexes = await env.DB.prepare("PRAGMA index_list('inbox_items')").all<{ name: string }>();
    expect(indexes.results.map((index) => index.name)).toEqual(expect.arrayContaining([
      "idx_inbox_items_member_status_created",
      "idx_inbox_items_member_client_key",
    ]));
  });

  it("allows the same client key for different members but rejects a same-member replay", async () => {
    const row = ["inbox-a", "member-a", "capture-1", "text", "Alpha", null, "inbox", null, null, 1, 1];
    await env.DB.prepare("INSERT INTO inbox_items (id, member_id, client_key, kind, content, source_url, status, promoted_task_id, promoted_submission_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(...row).run();
    await env.DB.prepare("INSERT INTO inbox_items (id, member_id, client_key, kind, content, source_url, status, promoted_task_id, promoted_submission_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("inbox-b", "member-b", ...row.slice(2)).run();
    await expect(env.DB.prepare("INSERT INTO inbox_items (id, member_id, client_key, kind, content, source_url, status, promoted_task_id, promoted_submission_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("inbox-replay", ...row.slice(1)).run()).rejects.toThrow();
  });

  it("rejects invalid Inbox status and kind values at the database boundary", async () => {
    await expect(env.DB.prepare("INSERT INTO inbox_items (id, member_id, client_key, kind, content, source_url, status, promoted_task_id, promoted_submission_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("inbox-invalid", "member-a", "capture-invalid", "binary", "bad", null, "inbox", null, null, 1, 1).run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO inbox_items (id, member_id, client_key, kind, content, source_url, status, promoted_task_id, promoted_submission_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("inbox-invalid-status", "member-a", "capture-invalid-status", "text", "bad", null, "deleted", null, null, 1, 1).run()).rejects.toThrow();
  });
});
