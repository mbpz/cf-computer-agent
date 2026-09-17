/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";

describe("review notification forward migration", () => {
  beforeEach(async () => {
    await reset();
    const boundary = MIGRATIONS.findIndex(({ name }) => name === "0050_admin_review_notifications.sql");
    expect(boundary).toBe(49);
    await applyD1Migrations(env.DB, MIGRATIONS.slice(0, boundary));
    await env.DB.exec("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('owner', 'owner-sub', 'owner@example.test', 'contributor', 'active', '2026-09-16', '2026-09-16'), ('actor', 'actor-sub', 'actor@example.test', 'admin', 'active', '2026-09-16', '2026-09-16');");
  });

  it("preserves every historical row, read state, deduplication, indexes and member foreign keys", async () => {
    const events = ["task.status_changed", "task.assignment_changed", "discussion.mention", "discussion.reply", "task.due", "task.overdue"];
    for (const [index, event] of events.entries()) {
      await env.DB.prepare(`INSERT INTO notifications VALUES (?, 'owner', ?, 'actor', 'task', 'task-old', '{"title":"Existing"}', ?, ?, 1000)`)
        .bind(`old-${index}`, event, `dedup-${index}`, index % 2 === 0 ? null : 2000).run();
    }
    const before = await env.DB.prepare("SELECT * FROM notifications ORDER BY id").all();
    await applyD1Migrations(env.DB, MIGRATIONS);
    expect((await env.DB.prepare("SELECT * FROM notifications ORDER BY id").all()).results).toEqual(before.results);
    await expect(env.DB.prepare("INSERT INTO notifications VALUES ('duplicate', 'owner', 'task.due', NULL, 'task', 'task-old', '{}', 'dedup-0', NULL, 1000)").run()).rejects.toThrow();
    const indexes = (await env.DB.prepare("PRAGMA index_list(notifications)").all<{ name: string }>()).results.map(({ name }) => name);
    expect(indexes).toEqual(expect.arrayContaining(["idx_notifications_recipient_created", "idx_notifications_recipient_type_created", "idx_notifications_recipient_unread_created"]));
    for (const decision of ["published", "rejected", "revision_requested"]) {
      await env.DB.prepare("INSERT INTO notifications VALUES (?, 'owner', ?, 'actor', 'submission', 'submission-new', '{}', ?, NULL, 3000)")
        .bind(decision, `submission.${decision}`, `submission:submission-new:${decision}`).run();
    }
    await env.DB.exec("DELETE FROM members WHERE id = 'actor';");
    expect((await env.DB.prepare("SELECT DISTINCT actor_member_id FROM notifications").all()).results).toEqual([{ actor_member_id: null }]);
    await env.DB.exec("DELETE FROM members WHERE id = 'owner';");
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM notifications").first()).toEqual({ count: 0 });
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });

  it("does not create notifications for historical terminal submissions", async () => {
    await env.DB.exec("INSERT INTO submissions (id, submitter_id, requested_space_id, kind, status, title, content, created_at, updated_at) VALUES ('old-review', 'owner', 'default', 'markdown', 'rejected', 'Old', 'Old body', '2026-09-16', '2026-09-16');");
    await applyD1Migrations(env.DB, MIGRATIONS);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM notifications").first()).toEqual({ count: 0 });
    await expect(env.DB.prepare("INSERT INTO notifications VALUES ('invalid', 'owner', 'submission.unknown', NULL, 'submission', 'old-review', '{}', 'invalid', NULL, 1000)").run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO notifications VALUES ('invalid', 'owner', 'submission.rejected', NULL, 'unsafe-target', 'old-review', '{}', 'invalid', NULL, 1000)").run()).rejects.toThrow();
  });
});
