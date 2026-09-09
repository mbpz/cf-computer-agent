import { AppError } from "../http";
import type { CalendarService } from "../calendar/service";
import type { TasksRepositoryPort } from "../tasks/repository";
import type { FocusRepositoryPort } from "./repository";
import type { FocusSession, FocusStartInput, FocusStatus } from "./types";

export interface FocusServiceOptions {
  id?: () => string;
  now?: () => Date;
  tasks?: Pick<TasksRepositoryPort, "findOwned">;
  calendar?: Pick<CalendarService, "create" | "setStatus">;
}

export class FocusService {
  private readonly id: () => string;
  private readonly now: () => Date;
  constructor(private readonly repository: FocusRepositoryPort, private readonly options: FocusServiceOptions = {}) {
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
  }

  async current(memberId: string): Promise<FocusSession | null> {
    return this.repository.findOpen(memberId);
  }

  async start(memberId: string, input: FocusStartInput): Promise<{ session: FocusSession; created: boolean }> {
    const normalized = normalizeStart(input, this.id());
    const replay = await this.repository.findByClientKey(memberId, normalized.clientKey);
    if (replay) return { session: replay, created: false };
    const open = await this.repository.findOpen(memberId);
    if (open) throw new AppError("FOCUS_ALREADY_OPEN", "A focus session is already open", 409);
    if (this.options.tasks && !await this.options.tasks.findOwned(memberId, normalized.taskId)) throw new AppError("TASK_NOT_FOUND", "Task not found", 404);
    const now = this.now().getTime();
    const calendar = this.options.calendar ? await this.options.calendar.create(memberId, {
      id: `focus-event-${normalized.id}`,
      clientKey: `focus:${normalized.clientKey}`,
      kind: "focus",
      title: normalized.title,
      startsAt: now,
      endsAt: now + normalized.durationMinutes * 60_000,
      timezone: "UTC",
      allDay: false,
      taskId: normalized.taskId,
    }) : null;
    const created = await this.repository.insert({ id: normalized.id, memberId, taskId: normalized.taskId, calendarEventId: calendar?.event.id ?? null, clientKey: normalized.clientKey, status: "active", startedAt: now, elapsedMs: 0, createdAt: now, updatedAt: now });
    const session = await this.repository.findOwned(memberId, normalized.id) || (!created ? await this.repository.findByClientKey(memberId, normalized.clientKey) || await this.repository.findOpen(memberId) : null);
    if (!session) throw new AppError("FOCUS_NOT_FOUND", "Focus session not found after create", 404, true);
    return { session, created };
  }

  async pause(memberId: string, id: string): Promise<FocusSession> {
    const session = await this.get(memberId, id);
    if (session.status !== "active") return session;
    const now = this.now().getTime();
    return this.transition(memberId, session, "paused", Date.parse(session.startedAt), now, null, session.elapsedMs + Math.max(0, now - Date.parse(session.startedAt)));
  }

  async resume(memberId: string, id: string): Promise<FocusSession> {
    const session = await this.get(memberId, id);
    if (session.status !== "paused") return session;
    const now = this.now().getTime();
    return this.transition(memberId, session, "active", now, null, null, session.elapsedMs);
  }

  async complete(memberId: string, id: string): Promise<FocusSession> {
    return this.finish(memberId, id, "completed");
  }

  async abandon(memberId: string, id: string): Promise<FocusSession> {
    return this.finish(memberId, id, "abandoned");
  }

  private async finish(memberId: string, id: string, status: Extract<FocusStatus, "completed" | "abandoned">): Promise<FocusSession> {
    const session = await this.get(memberId, id);
    if (session.status === "completed" || session.status === "abandoned") return session;
    const now = this.now().getTime();
    const elapsed = session.status === "active" ? session.elapsedMs + Math.max(0, now - Date.parse(session.startedAt)) : session.elapsedMs;
    const result = await this.transition(memberId, session, status, session.startedAt ? Date.parse(session.startedAt) : now, session.pausedAt ? Date.parse(session.pausedAt) : null, now, elapsed);
    if (result.calendarEventId && this.options.calendar) await this.options.calendar.setStatus(memberId, result.calendarEventId, status === "completed" ? "completed" : "canceled");
    return result;
  }

  private async transition(memberId: string, session: FocusSession, status: FocusStatus, startedAt: number, pausedAt: number | null, endedAt: number | null, elapsedMs: number): Promise<FocusSession> {
    const result = await this.repository.update(memberId, session.id, { status, startedAt, pausedAt, endedAt, elapsedMs, updatedAt: this.now().getTime() });
    if (!result) throw new AppError("FOCUS_NOT_FOUND", "Focus session not found", 404);
    return result;
  }

  private async get(memberId: string, id: string): Promise<FocusSession> {
    const session = await this.repository.findOwned(memberId, id);
    if (!session) throw new AppError("FOCUS_NOT_FOUND", "Focus session not found", 404);
    return session;
  }
}

function normalizeStart(input: FocusStartInput, generatedId: string): { id: string; clientKey: string; taskId: string; title: string; durationMinutes: number } {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const id = record.id === undefined ? generatedId : record.id;
  const clientKey = typeof record.clientKey === "string" ? record.clientKey.trim() : "";
  const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
  const title = typeof record.title === "string" && record.title.trim() ? record.title.trim() : "Focus session";
  const durationMinutes = record.durationMinutes === undefined ? 25 : record.durationMinutes;
  if (!validId(id) || !validId(clientKey) || !validId(taskId) || title.length > 240 || typeof durationMinutes !== "number" || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 240) throw new AppError("FOCUS_INVALID", "Focus fields are invalid", 400);
  return { id, clientKey, taskId, title, durationMinutes };
}
function validId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value); }
