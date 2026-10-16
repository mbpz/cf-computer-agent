/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { TasksRepository } from "../../src/tasks/repository";
import type { TaskStatus } from "../../src/tasks/types";
import { MIGRATIONS } from "../fixtures/d1";

const ORIGIN = "https://memory.crgmhrc.asia";
/** Exactly the four columns the board renders; `canceled` is not a board column. */
const BOARD_COLUMNS = ["todo", "doing", "blocked", "done"] as const;
type BoardColumn = (typeof BOARD_COLUMNS)[number];

interface TaskPayload {
  id: string;
  status: TaskStatus;
  progress: number;
  completedAt: string | null;
  updatedAt: string;
}

interface TaskPagePayload {
  items: Array<{ id: string; status: TaskStatus }>;
  pagination: { page: number; pageSize: number; total: number };
}

describe("board move convergence", () => {
  let sessionOne: string;
  let sessionTwo: string;
  let sessionOtherMember: string;

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)",
    ).bind(
      "member-a", "subject-a", "a@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
      "member-b", "subject-b", "b@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
    ).run();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => new Date() });
    const memberA = (await members.findByIdentitySubject("subject-a"))!;
    // Two independent sessions of the same member: the same board opened twice.
    sessionOne = (await sessions.create(memberA)).token;
    sessionTwo = (await sessions.create(memberA)).token;
    sessionOtherMember = (await sessions.create((await members.findByIdentitySubject("subject-b"))!)).token;
  });

  it("leaves exactly one authoritative column when two sessions race one card into different columns", async () => {
    await seedTask("task-race");
    const [first, second] = await Promise.all([
      move(sessionOne, "task-race", "doing", "todo"),
      move(sessionTwo, "task-race", "done", "todo"),
    ]);

    const won = [first, second].filter((response) => response.status === 200);
    const lost = [first, second].filter((response) => response.status === 409);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);

    const wonStatus = ((await won[0]!.json()) as TaskPayload).status;
    expect(["doing", "done"]).toContain(wonStatus);
    // The loser is told, visibly, that the card changed elsewhere instead of silently winning or failing.
    await expect(lost[0]!.json()).resolves.toMatchObject({ error: { code: "TASK_STATUS_CONFLICT" } });

    expect(await authoritativeColumns(sessionOne, "task-race")).toEqual([wonStatus]);
    // Two sessions, one committed transition: the loser's write never reached the row.
    expect(await statusTransitionCount("task-race")).toBe(1);
    expect(await statusChangeAuditCount("task-race")).toBe(1);
  });

  it("refuses the second writer that read the same column, so only one of the two moves lands", async () => {
    await seedTask("task-predicate");
    const repository = new TasksRepository(env.DB);
    // Both sessions rendered this snapshot before either of them wrote.
    const first = (await repository.findOwned("member-a", "task-predicate"))!;
    const second = (await repository.findOwned("member-a", "task-predicate"))!;
    expect(first.status).toBe("todo");
    expect(second.status).toBe("todo");

    const now = Date.now();
    expect(await repository.compareAndSetStatus("member-a", "task-predicate", "todo", "doing", null, 0, now + 1)).toBe(true);
    // The loser's write is refused by the status predicate in the statement itself, not applied.
    expect(await repository.compareAndSetStatus("member-a", "task-predicate", "todo", "done", null, 0, now + 2)).toBe(false);
    expect(await repository.compareAndSetStatus("member-a", "task-predicate", "done", "doing", null, 0, now + 3)).toBe(false);

    expect(await authoritativeColumns(sessionOne, "task-predicate")).toEqual(["doing"]);
    expect(await statusTransitionCount("task-predicate")).toBe(1);
  });

  it("rejects a stale session's move from the column it read and shows the winner's column", async () => {
    await seedTask("task-stale");
    // Both sessions render this snapshot.
    expect(await authoritativeColumns(sessionOne, "task-stale")).toEqual(["todo"]);

    // Session one wins while session two still shows the pre-move column.
    expect((await move(sessionOne, "task-stale", "doing", "todo")).status).toBe(200);
    const stale = await move(sessionTwo, "task-stale", "done", "todo");
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({ error: { code: "TASK_STATUS_CONFLICT" } });

    // The loser's board re-reads and renders the winner's authoritative column, not its own target.
    expect(await authoritativeColumns(sessionTwo, "task-stale")).toEqual(["doing"]);
    expect(await statusTransitionCount("task-stale")).toBe(1);
  });

  it("converges two sessions pressing the same move at once without a second transition", async () => {
    await seedTask("task-same");
    const [left, right] = await Promise.all([
      move(sessionOne, "task-same", "doing", "todo"),
      move(sessionTwo, "task-same", "doing", "todo"),
    ]);

    // Both sessions succeed: the same card into the same column is one move, observed twice.
    expect([left.status, right.status]).toEqual([200, 200]);
    const leftTask = await left.json() as TaskPayload;
    const rightTask = await right.json() as TaskPayload;
    expect(leftTask.status).toBe("doing");
    expect(rightTask).toEqual(leftTask);

    expect(await authoritativeColumns(sessionOne, "task-same")).toEqual(["doing"]);
    expect(await statusTransitionCount("task-same")).toBe(1);
    expect(await statusChangeAuditCount("task-same")).toBe(1);
  });

  it("converges a pending move replayed into the same column without a second transition", async () => {
    await seedTask("task-replay");
    const first = await move(sessionOne, "task-replay", "done", "todo");
    expect(first.status).toBe(200);
    const applied = await first.json() as TaskPayload;
    expect(applied).toMatchObject({ status: "done", progress: 100 });

    // The tab never saw the first response, then replays the same pending move twice.
    const second = await move(sessionOne, "task-replay", "done", "todo");
    const third = await move(sessionTwo, "task-replay", "done", "todo");
    expect([second.status, third.status]).toEqual([200, 200]);
    expect(await second.json()).toEqual(applied);
    expect(await third.json()).toEqual(applied);

    expect(await authoritativeColumns(sessionOne, "task-replay")).toEqual(["done"]);
    expect(await statusTransitionCount("task-replay")).toBe(1);
    expect(await statusChangeAuditCount("task-replay")).toBe(1);
  });

  it("rejects a lost-response retry against a newer transition instead of clobbering it", async () => {
    await seedTask("task-lost");
    // Session one journals { source: todo, target: doing } before sending and never sees this response.
    expect((await move(sessionOne, "task-lost", "doing", "todo")).status).toBe(200);
    // Session two moves the card on, from the column it can see.
    expect((await move(sessionTwo, "task-lost", "blocked", "doing")).status).toBe(200);

    // Session one refreshes, still holds the journaled intent, and retries it verbatim.
    const retry = await move(sessionOne, "task-lost", "doing", "todo");
    expect(retry.status).toBe(409);
    await expect(retry.json()).resolves.toMatchObject({ error: { code: "TASK_STATUS_CONFLICT" } });

    expect(await authoritativeColumns(sessionOne, "task-lost")).toEqual(["blocked"]);
    // Exactly two committed transitions: todo->doing and doing->blocked. The retry added none.
    expect(await statusTransitionCount("task-lost")).toBe(2);
    expect(await statusChangeAuditCount("task-lost")).toBe(2);
  });

  it("keeps the journaled source load-bearing: a retry that drops expectedStatus is refused instead of clobbering a newer column", async () => {
    await seedTask("task-unguarded");
    expect((await move(sessionOne, "task-unguarded", "doing", "todo")).status).toBe(200);
    expect((await move(sessionTwo, "task-unguarded", "blocked", "doing")).status).toBe(200);

    // Dropping the journaled source can no longer write an unconditional target: the server
    // refuses the request, so the newer column and the transition count stay unchanged.
    const unguarded = await api("/api/tasks/task-unguarded/status", sessionOne, { method: "POST", body: JSON.stringify({ status: "doing" }) });
    expect(unguarded.status).toBe(400);
    await expect(unguarded.json()).resolves.toMatchObject({ error: { code: "TASK_INVALID" } });
    expect(await authoritativeColumns(sessionOne, "task-unguarded")).toEqual(["blocked"]);
    expect(await statusTransitionCount("task-unguarded")).toBe(2);
  });

  it("never lets a second member read or move another member's task, and the owner's column still moves", async () => {
    await seedTask("task-private");

    const read = await api("/api/tasks/task-private", sessionOtherMember);
    expect(read.status).toBe(404);
    await expect(read.json()).resolves.toMatchObject({ error: { code: "TASK_NOT_FOUND" } });

    for (const column of BOARD_COLUMNS) {
      const response = await api(`/api/tasks?page=1&pageSize=20&status=${column}`, sessionOtherMember);
      expect(response.status).toBe(200);
      expect(((await response.json()) as TaskPagePayload).items).toEqual([]);
    }

    // The compare-and-set is member-scoped too: a foreign move with the right expected column changes nothing.
    const foreign = await move(sessionOtherMember, "task-private", "doing", "todo");
    expect(foreign.status).toBe(404);
    await expect(foreign.json()).resolves.toMatchObject({ error: { code: "TASK_NOT_FOUND" } });

    expect(await authoritativeColumns(sessionOne, "task-private")).toEqual(["todo"]);
    expect(await statusTransitionCount("task-private")).toBe(0);
    expect((await move(sessionOne, "task-private", "doing", "todo")).status).toBe(200);
    expect(await authoritativeColumns(sessionOne, "task-private")).toEqual(["doing"]);
  });

  async function seedTask(id: string): Promise<void> {
    const response = await api("/api/tasks", sessionOne, { method: "POST", body: JSON.stringify({ id, title: id }) });
    expect(response.status).toBe(201);
  }

  /** The journaled intent's two fields, sent exactly the way the tab sends them. */
  function move(token: string, taskId: string, target: BoardColumn, source: BoardColumn): Promise<Response> {
    return api(`/api/tasks/${taskId}/status`, token, { method: "POST", body: JSON.stringify({ status: target, expectedStatus: source }) });
  }
});

/** Reads the four board columns the way the client does and returns the columns holding the card. */
async function authoritativeColumns(token: string, taskId: string): Promise<BoardColumn[]> {
  const holders: BoardColumn[] = [];
  const seen = new Set<string>();
  for (const column of BOARD_COLUMNS) {
    const response = await api(`/api/tasks?page=1&pageSize=20&status=${column}`, token);
    expect(response.status).toBe(200);
    const page = await response.json() as TaskPagePayload;
    expect(page.pagination.total).toBe(page.items.length);
    for (const item of page.items) {
      // A card never renders twice, and never under another column's status.
      expect(seen.has(item.id)).toBe(false);
      seen.add(item.id);
      expect(item.status).toBe(column);
      if (item.id === taskId) holders.push(column);
    }
  }
  return holders;
}

/** Committed status transitions, persisted by the outbox trigger inside the compare-and-set statement. */
async function statusTransitionCount(taskId: string): Promise<number> {
  const rows = await env.DB.prepare("SELECT id FROM task_status_notification_intents WHERE task_id = ?").bind(taskId).all<{ id: string }>();
  return rows.results.length;
}

async function statusChangeAuditCount(taskId: string): Promise<number> {
  const rows = await env.DB.prepare(
    "SELECT id FROM audit_events WHERE action = 'task.status_changed' AND resource_id = ?",
  ).bind(taskId).all<{ id: string }>();
  return rows.results.length;
}

async function api(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("cookie", `__Host-memory-session=${token}`);
  headers.set("origin", ORIGIN);
  headers.set("content-type", "application/json");
  const context = createExecutionContext();
  const response = await createApp().fetch!(
    new Request(`${ORIGIN}${path}`, { ...init, headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>,
    env,
    context,
  );
  await waitOnExecutionContext(context);
  return response;
}
