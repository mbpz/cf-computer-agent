import { describe, expect, it } from "vitest";
import { CalendarService } from "../../src/calendar/service";
import type { CalendarRepositoryPort } from "../../src/calendar/repository";
import type { CalendarEvent, CalendarEventStatus } from "../../src/calendar/types";

const NOW = new Date("2026-09-09T00:00:00.000Z");

describe("CalendarService", () => {
  it("creates member-owned events idempotently and validates range", async () => {
    const repository = new FakeCalendarRepository();
    const service = new CalendarService(repository, { id: () => "event-a", now: () => NOW });
    const first = await service.create("member-a", { id: "event-a", clientKey: "client-a", title: "Focus", startsAt: "2026-09-09T09:00:00.000Z", endsAt: "2026-09-09T10:00:00.000Z" });
    const replay = await service.create("member-a", { id: "event-b", clientKey: "client-a", title: "Changed", startsAt: "2026-09-09T11:00:00.000Z", endsAt: "2026-09-09T12:00:00.000Z" });
    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.event.title).toBe("Focus");
    await expect(service.create("member-a", { id: "bad", clientKey: "bad", title: "Invalid", startsAt: 10, endsAt: 9 })).rejects.toMatchObject({ code: "CALENDAR_INVALID" });
    await expect(service.list("member-a", NOW.getTime(), NOW.getTime() + 32 * 86_400_000)).rejects.toMatchObject({ code: "CALENDAR_RANGE_INVALID" });
  });

  it("rejects cross-member task and project relations", async () => {
    const repository = new FakeCalendarRepository();
    const service = new CalendarService(repository, {
      tasks: { findOwned: async (memberId, id) => memberId === "member-a" && id === "task-a" ? ({ id } as never) : null },
      projects: { findOwned: async (memberId, id) => memberId === "member-a" && id === "project-a" ? ({ id } as never) : null },
    });
    await expect(service.create("member-a", { id: "event-a", clientKey: "client-a", title: "Bad task", startsAt: 100, endsAt: 200, taskId: "task-b" })).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    await expect(service.create("member-a", { id: "event-b", clientKey: "client-b", title: "Bad project", startsAt: 100, endsAt: 200, projectId: "project-b" })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });
});

class FakeCalendarRepository implements CalendarRepositoryPort {
  events = new Map<string, CalendarEvent>();
  async insert(input: Parameters<CalendarRepositoryPort["insert"]>[0]) { if (this.events.has(input.id) || [...this.events.values()].some((event) => event.memberId === input.memberId && event.clientKey === input.clientKey)) return false; this.events.set(input.id, map(input, "scheduled")); return true; }
  async findOwned(memberId: string, id: string) { const event = this.events.get(id); return event?.memberId === memberId ? event : null; }
  async findByClientKey(memberId: string, clientKey: string) { return [...this.events.values()].find((event) => event.memberId === memberId && event.clientKey === clientKey) ?? null; }
  async listOwned(memberId: string, request: { from: number; to: number; limit: number; cursor?: string; status?: CalendarEventStatus }) { return { items: [...this.events.values()].filter((event) => event.memberId === memberId && Date.parse(event.startsAt) < request.to && Date.parse(event.endsAt) > request.from), nextCursor: undefined }; }
  async update(memberId: string, id: string, input: Parameters<CalendarRepositoryPort["update"]>[2]) { const event = await this.findOwned(memberId, id); if (!event) return null; Object.assign(event, { ...mapInput(input), updatedAt: new Date(input.updatedAt).toISOString() }); return event; }
  async updateStatus(memberId: string, id: string, status: CalendarEventStatus, updatedAt: number) { const event = await this.findOwned(memberId, id); if (!event) return null; event.status = status; event.updatedAt = new Date(updatedAt).toISOString(); return event; }
}

function map(input: Parameters<CalendarRepositoryPort["insert"]>[0], status: CalendarEventStatus): CalendarEvent { return { id: input.id, memberId: input.memberId, clientKey: input.clientKey, kind: input.kind, title: input.title, description: input.description, startsAt: new Date(input.startsAt).toISOString(), endsAt: new Date(input.endsAt).toISOString(), timezone: input.timezone, allDay: input.allDay, status, taskId: input.taskId, projectId: input.projectId, createdAt: new Date(input.createdAt).toISOString(), updatedAt: new Date(input.updatedAt).toISOString() }; }
function mapInput(input: Parameters<CalendarRepositoryPort["update"]>[2]) { return { title: input.title, description: input.description, startsAt: new Date(input.startsAt).toISOString(), endsAt: new Date(input.endsAt).toISOString(), timezone: input.timezone, allDay: input.allDay, taskId: input.taskId, projectId: input.projectId }; }
