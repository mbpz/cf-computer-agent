/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";

describe("production 0032 catch-up rehearsal (synthetic data only)", () => {
  beforeEach(async () => {
    await reset();
    expect(MIGRATIONS[31]?.name).toBe("0032_workspace_tasks.sql");
    expect(MIGRATIONS[49]?.name).toBe("0050_admin_review_notifications.sql");
    await applyD1Migrations(env.DB, MIGRATIONS.slice(0, 32));
    await env.DB.exec("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('catchup-owner', 'catchup-sub', 'catchup@example.test', 'contributor', 'active', '2026-09-17', '2026-09-17');");
    await env.DB.exec("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at) VALUES ('catchup-task', 'catchup-owner', '保留任务', 'Synthetic only', 'todo', 0, 'medium', 1000, 1000);");
    await env.DB.exec("INSERT INTO task_tags (task_id, member_id, tag) VALUES ('catchup-task', 'catchup-owner', '保留标签');");
  });

  it("preserves old member/task/tag/role rows and can repeat the tracked upgrade", async () => {
    const members = (await env.DB.prepare("SELECT * FROM members ORDER BY id").all()).results;
    const roles = (await env.DB.prepare("SELECT * FROM roles ORDER BY id").all()).results;
    const tags = (await env.DB.prepare("SELECT * FROM task_tags ORDER BY task_id, tag").all()).results;
    const task = await env.DB.prepare("SELECT * FROM tasks WHERE id = 'catchup-task'").first();

    await applyD1Migrations(env.DB, MIGRATIONS);
    expect((await env.DB.prepare("SELECT * FROM members ORDER BY id").all()).results).toEqual(members);
    expect((await env.DB.prepare("SELECT * FROM roles ORDER BY id").all()).results).toEqual(roles);
    expect((await env.DB.prepare("SELECT * FROM task_tags ORDER BY task_id, tag").all()).results).toEqual(tags);
    expect(await env.DB.prepare("SELECT * FROM tasks WHERE id = 'catchup-task'").first()).toEqual({ ...task, status_version: 0 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM notifications").first()).toEqual({ count: 0 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM task_status_notification_intents").first()).toEqual({ count: 0 });
    const schema = (await env.DB.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all()).results;
    await applyD1Migrations(env.DB, MIGRATIONS);
    expect((await env.DB.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all()).results).toEqual(schema);

    await env.DB.exec("UPDATE tasks SET status = 'doing', status_version = 1, updated_at = 2000 WHERE id = 'catchup-task';");
    expect(await env.DB.prepare("SELECT recipient_member_id, status, deduplication_key FROM task_status_notification_intents").first()).toEqual({
      recipient_member_id: "catchup-owner", status: "doing", deduplication_key: "task:catchup-task:status:todo:doing:v1",
    });
    await env.DB.exec("INSERT INTO discussion_threads (id, context_kind, context_id, creator_member_id, created_at, updated_at) VALUES ('catchup-thread', 'task', 'catchup-task', 'catchup-owner', 2000, 2000);");
    expect((await env.DB.prepare("SELECT principal_kind, principal_id, thread_id FROM discussion_thread_access").all()).results).toEqual([
      { principal_kind: "task_member", principal_id: "catchup-owner", thread_id: "catchup-thread" },
    ]);
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });

  it("stops at an incompatible 0034 menu and resumes after fixing only the synthetic conflict", async () => {
    await env.DB.exec("INSERT INTO menus (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at) VALUES ('catchup-conflict', 'menu-workspace', 'catchup-conflict', 'NAV_HOME', '/boards', 'House', 'workspace', 99, '0x0', 'active', 1, 0, '2026-09-17', '2026-09-17');");
    await expect(applyD1Migrations(env.DB, MIGRATIONS)).rejects.toThrow();
    expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE name = 'assets_admin_page'").first()).toEqual({ name: "assets_admin_page" });
    expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE name = 'notifications'").first()).toBeNull();
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM menus WHERE id IN ('menu-boards', 'menu-notifications', 'menu-messages')").first()).toEqual({ count: 0 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = 'catchup-task'").first()).toEqual({ count: 1 });
    // This is a disposable local fixture, never a production conflict resolution.
    await env.DB.exec("DELETE FROM menus WHERE id = 'catchup-conflict';");
    await applyD1Migrations(env.DB, MIGRATIONS);
    expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE name = 'notifications'").first()).toEqual({ name: "notifications" });
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });

  it("preserves the calendar owner and content when deleting a linked task after catch-up", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.exec("INSERT INTO calendar_events (id, member_id, client_key, kind, title, starts_at, ends_at, timezone, status, task_id, created_at, updated_at) VALUES ('catchup-calendar', 'catchup-owner', 'catchup-calendar-key', 'event', 'Synthetic linked event', 1000, 2000, 'UTC', 'scheduled', 'catchup-task', 1000, 1000);");
    const before = await env.DB.prepare("SELECT * FROM calendar_events WHERE id = 'catchup-calendar'").first();
    await env.DB.prepare("DELETE FROM tasks WHERE member_id = 'catchup-owner' AND id = 'catchup-task'").run();
    const after = await env.DB.prepare("SELECT * FROM calendar_events WHERE id = 'catchup-calendar'").first();
    expect(after).toEqual({ ...before, task_id: null, updated_at: expect.any(Number) });
    expect(Number(after!.updated_at)).toBeGreaterThanOrEqual(1000);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = 'catchup-task'").first()).toEqual({ count: 0 });
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });

  it("upgrades populated 0050 without rewriting events and supports tracked replay", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS.slice(0, 50));
    await env.DB.exec("INSERT INTO calendar_events (id, member_id, client_key, kind, title, starts_at, ends_at, timezone, status, task_id, created_at, updated_at) VALUES ('old-calendar', 'catchup-owner', 'old-calendar-key', 'event', 'Keep existing content', 1000, 2000, 'UTC', 'scheduled', 'catchup-task', 1000, 1000);");
    const before = await env.DB.prepare("SELECT * FROM calendar_events WHERE id = 'old-calendar'").first();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await applyD1Migrations(env.DB, MIGRATIONS);
    expect(await env.DB.prepare("SELECT * FROM calendar_events WHERE id = 'old-calendar'").first()).toEqual(before);
    await env.DB.prepare("DELETE FROM tasks WHERE member_id = 'catchup-owner' AND id = 'catchup-task'").run();
    expect(await env.DB.prepare("SELECT member_id, task_id, title FROM calendar_events WHERE id = 'old-calendar'").first()).toEqual({ member_id: "catchup-owner", task_id: null, title: "Keep existing content" });
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
});
