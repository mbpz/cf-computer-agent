/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";

describe("private Goals migration contract", () => {
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

  it("creates a member-scoped goals schema with bounded states and stable pagination index", async () => {
    const table = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'goals'").first<{ sql: string }>();
    expect(table?.sql).toContain("status TEXT NOT NULL");
    expect(table?.sql).toContain("progress INTEGER NOT NULL");
    expect(table?.sql).toContain("client_key TEXT NOT NULL");
    expect(table?.sql).toContain("status IN ('active', 'paused', 'completed', 'archived')");
    const columns = await env.DB.prepare("PRAGMA table_info('goals')").all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).toEqual([
      "id", "member_id", "client_key", "title", "description", "status", "progress", "target_at", "created_at", "updated_at",
    ]);
    const indexes = await env.DB.prepare("PRAGMA index_list('goals')").all<{ name: string }>();
    expect(indexes.results.map((index) => index.name)).toEqual(expect.arrayContaining([
      "idx_goals_member_status_updated",
      "idx_goals_member_client_key",
    ]));
  });

  it("allows the same client key for different members but rejects a same-member replay", async () => {
    const row = ["goal-a", "member-a", "goal-1", "Launch v2", null, "active", 0, null, 1, 1];
    await env.DB.prepare("INSERT INTO goals (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(...row).run();
    await env.DB.prepare("INSERT INTO goals (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("goal-b", "member-b", ...row.slice(2)).run();
    await expect(env.DB.prepare("INSERT INTO goals (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("goal-replay", ...row.slice(1)).run()).rejects.toThrow();
  });

  it("rejects invalid Goal status and progress values at the database boundary", async () => {
    await expect(env.DB.prepare("INSERT INTO goals (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("goal-invalid", "member-a", "goal-invalid", "Bad", null, "deleted", 0, null, 1, 1).run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO goals (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("goal-invalid-progress", "member-a", "goal-invalid-progress", "Bad", null, "active", 101, null, 1, 1).run()).rejects.toThrow();
  });

  it("seeds the Goals workbench menu with task permission semantics", async () => {
    const menu = await env.DB.prepare("SELECT path, label_key, required_bits, status, visible FROM menus WHERE path = '/goals'").first<{ path: string; label_key: string; required_bits: string; status: string; visible: number }>();
    expect(menu).toEqual({ path: "/goals", label_key: "NAV_GOALS", required_bits: "0x100000", status: "active", visible: 1 });
  });
});
