/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";

const migrationName = "0055_focus_calendar_terminal_repair.sql";

describe("historical focus calendar terminal repair", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS.filter(({name}) => name < migrationName));
    for (const member of ["a", "b"]) {
      await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', '2026-09-29', '2026-09-29')").bind(member, member, `${member}@example.test`).run();
      for (const task of ["first", "second"]) await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at) VALUES (?, ?, 'Task', '', 'todo', 0, 'medium', 1000, 1000)").bind(`${member}-${task}`, member).run();
    }
  });

  async function calendar(id: string, member = "a", task: string | null = "a-first", kind = "focus", status = "scheduled", version = 1000) {
    await env.DB.prepare("INSERT INTO calendar_events (id, member_id, client_key, kind, title, description, starts_at, ends_at, timezone, all_day, status, task_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'Keep title', 'Keep notes', 1000, 61000, 'UTC', 0, ?, ?, 1000, ?)").bind(id, member, `focus:${id}`, kind, status, task, version).run();
  }
  async function focus(id: string, calendarId: string | null, status = "completed", member = "a") {
    await env.DB.prepare("INSERT INTO focus_sessions (id, member_id, task_id, calendar_event_id, client_key, status, started_at, ended_at, elapsed_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1000, ?, 500, 1000, 2000)").bind(id, member, `${member}-first`, calendarId, id, status, status === "active" ? null : 2000).run();
  }
  async function rows(table: string) { return (await env.DB.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).results; }
  async function repair() {
    const migration = MIGRATIONS.find(({name}) => name === migrationName);
    expect(migration, "the forward repair migration exists").toBeDefined();
    await env.DB.batch(migration!.queries.map(query => env.DB.prepare(query)));
  }

  it("repairs only uniquely owned terminal links, preserves payload and focus rows, and is idempotent", async () => {
    await calendar("completed"); await focus("complete", "completed");
    await calendar("abandoned", "a", "a-first", "focus", "scheduled", 9000); await focus("abandon", "abandoned", "abandoned");
    await calendar("already", "a", "a-first", "focus", "completed"); await focus("already", "already");
    const before = await rows("calendar_events"); const sessions = await rows("focus_sessions");
    await repair();
    const after = await rows("calendar_events");
    expect(after).toEqual(before.map(row => row.id === "completed" ? {...row, status: "completed", updated_at: 2000} : row.id === "abandoned" ? {...row, status: "canceled", updated_at: 9001} : row));
    expect(await rows("focus_sessions")).toEqual(sessions);
    await repair();
    expect(await rows("calendar_events")).toEqual(after);
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });

  it("leaves orphan, foreign, wrong-task, unlinked, ambiguous, active and non-focus calendars unchanged", async () => {
    await calendar("orphan");
    await calendar("foreign", "b", "b-first"); await focus("foreign", "foreign");
    await calendar("wrong-task", "a", "a-second"); await focus("wrong-task", "wrong-task");
    await calendar("detached", "a", null); await focus("detached", "detached");
    await calendar("event", "a", "a-first", "event"); await focus("event", "event");
    await calendar("active"); await focus("active", "active", "active");
    await calendar("ambiguous"); await focus("duplicate-a", "ambiguous"); await focus("duplicate-b", "ambiguous", "abandoned");
    await calendar("foreign-ref"); await focus("own-ref", "foreign-ref"); await focus("other-ref", "foreign-ref", "completed", "b");
    await focus("missing", "missing"); await focus("unlinked", null);
    const before = await rows("calendar_events"); const sessions = await rows("focus_sessions");
    await repair();
    expect(await rows("calendar_events")).toEqual(before);
    expect(await rows("focus_sessions")).toEqual(sessions);
  });

  it("rolls back all repairs on a write failure and succeeds on explicit retry", async () => {
    await calendar("a"); await focus("a", "a"); await calendar("z"); await focus("z", "z", "abandoned");
    const before = await rows("calendar_events");
    await env.DB.exec("CREATE TRIGGER fail_repair BEFORE UPDATE ON calendar_events WHEN NEW.id = 'z' BEGIN SELECT RAISE(ABORT, 'injected repair failure'); END");
    await expect(repair()).rejects.toThrow();
    expect(await rows("calendar_events")).toEqual(before);
    await env.DB.exec("DROP TRIGGER fail_repair");
    await repair();
    expect((await rows("calendar_events")).map(row => row.status)).toEqual(["completed", "canceled"]);
  });
});
