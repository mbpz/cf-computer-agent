import { describe, expect, it } from "vitest";
import { ProjectTimelineService } from "../../src/project-timeline/service";
import type { ProjectTimelineItem } from "../../src/project-timeline/types";

const NOW = new Date("2026-09-09T10:00:00.000Z");

describe("ProjectTimelineService", () => {
  it("creates private timeline items and makes client keys idempotent", async () => {
    const rows = new Map<string, ProjectTimelineItem>();
    const projects = { findOwned: async (memberId: string, id: string) => memberId === "member-a" && id === "project-a" ? {} as never : null };
    const repo = {
      insert: async (input: any) => { if ([...rows.values()].some((row) => row.clientKey === input.clientKey)) return false; rows.set(input.id, { ...input, status: "open", startsAt: input.startsAt === null ? null : new Date(input.startsAt).toISOString(), dueAt: input.dueAt === null ? null : new Date(input.dueAt).toISOString(), createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }); return true; },
      findOwned: async (memberId: string, projectId: string, id: string) => rows.get(id)?.memberId === memberId && rows.get(id)?.projectId === projectId ? rows.get(id)! : null,
      findByClientKey: async (memberId: string, key: string) => [...rows.values()].find((row) => row.memberId === memberId && row.clientKey === key) ?? null,
      listOwned: async () => ({ items: [...rows.values()] }),
      updateStatus: async (memberId: string, projectId: string, id: string, status: any) => { const row = await (repo as any).findOwned(memberId, projectId, id); if (!row) return null; row.status = status; return row; },
    } as never;
    const service = new ProjectTimelineService(repo, projects, { now: () => NOW, id: () => "timeline-a" });
    const first = await service.create("member-a", "project-a", { id: "timeline-a", clientKey: "capture-a", kind: "decision", title: "Choose scope", body: "Keep the free tier." });
    const replay = await service.create("member-a", "project-a", { id: "other", clientKey: "capture-a", kind: "meeting", title: "Ignored" });
    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.item.kind).toBe("decision");
    await expect(service.create("member-b", "project-a", { clientKey: "x", kind: "meeting", title: "No access" })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND", status: 404 });
  });

  it("supports completing and archiving an item", async () => {
    const row: any = { id: "timeline-a", memberId: "member-a", projectId: "project-a", clientKey: "x", kind: "action_item", title: "Ship", body: "", status: "open", startsAt: null, dueAt: null, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
    const repo = { findOwned: async (_m: string, _p: string, id: string) => id === row.id ? row : null, findByClientKey: async () => null, insert: async () => true, listOwned: async () => ({ items: [row] }), updateStatus: async (_m: string, _p: string, _id: string, status: any) => Object.assign(row, { status }) } as never;
    const service = new ProjectTimelineService(repo, { findOwned: async () => ({}) as never });
    expect((await service.setStatus("member-a", "project-a", row.id, "done")).status).toBe("done");
    expect((await service.setStatus("member-a", "project-a", row.id, "archived")).status).toBe("archived");
  });
});
