import { describe, expect, it } from "vitest";
import { FocusService } from "../../src/focus/service";

describe("FocusService", () => {
  it("starts one task focus and makes repeated client keys idempotent", async () => {
    let now = new Date("2026-09-09T10:00:00.000Z");
    const rows = new Map<string, any>();
    const repo = {
      findByClientKey: async (_member: string, key: string) => [...rows.values()].find((row) => row.clientKey === key) ?? null,
      findOpen: async (_member: string) => [...rows.values()].find((row) => row.status === "active" || row.status === "paused") ?? null,
      findOwned: async (_member: string, id: string) => rows.get(id) ?? null,
      insert: async (input: any) => { rows.set(input.id, { ...input, startedAt: new Date(input.startedAt).toISOString(), pausedAt: null, endedAt: null, elapsedMs: 0, createdAt: new Date(input.createdAt).toISOString(), updatedAt: new Date(input.updatedAt).toISOString() }); return true; },
      update: async (_member: string, id: string, input: any) => { const row = rows.get(id); if (!row) return null; const next = { ...row, ...input, updatedAt: new Date(input.updatedAt).toISOString() }; rows.set(id, next); return next; },
    } as never;
    const tasks = { findOwned: async (member: string, id: string) => member === "member-a" && id === "task-a" ? { id, title: "Write" } : null } as never;
    const calendar = { create: async (_member: string, input: any) => ({ created: true, event: { id: "event-1", ...input } }) } as never;
    const service = new FocusService(repo, { tasks, calendar, now: () => now, id: () => "focus-1" });
    const first = await service.start("member-a", { taskId: "task-a", clientKey: "capture-1" });
    const replay = await service.start("member-a", { taskId: "task-a", clientKey: "capture-1" });
    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.session.id).toBe("focus-1");
  });

  it("pauses, resumes and completes with elapsed time", async () => {
    let now = new Date("2026-09-09T10:00:00.000Z");
    const row: any = { id: "focus-1", memberId: "member-a", taskId: "task-a", status: "active", startedAt: now.toISOString(), pausedAt: null, endedAt: null, elapsedMs: 0, updatedAt: now.toISOString() };
    const repo = { findOpen: async () => row, findOwned: async () => row, update: async (_m: string, _id: string, input: any) => Object.assign(row, { ...input, startedAt: new Date(input.startedAt).toISOString(), pausedAt: input.pausedAt === null ? null : new Date(input.pausedAt).toISOString(), endedAt: input.endedAt === null ? null : new Date(input.endedAt).toISOString(), updatedAt: new Date(input.updatedAt).toISOString() }) } as never;
    const service = new FocusService(repo, { now: () => now });
    now = new Date("2026-09-09T10:25:00.000Z");
    await service.pause("member-a", "focus-1");
    expect(row.status).toBe("paused");
    expect(row.elapsedMs).toBe(1_500_000);
    now = new Date("2026-09-09T10:35:00.000Z");
    await service.resume("member-a", "focus-1");
    now = new Date("2026-09-09T10:45:00.000Z");
    const completed = await service.complete("member-a", "focus-1");
    expect(completed.status).toBe("completed");
    expect(completed.elapsedMs).toBe(2_100_000);
  });
});
