import { nextPlanningVersion, planningConflict, requirePlanningVersion } from "../planning-version";
import { AppError } from "../http";
import { normalizeNumberedPageRequest, type NumberedPageRequest, type NumberedPage, parsePageRequest, type PageRequest } from "../pagination";
import type { ProjectsRepositoryPort } from "../projects/repository";
import type { TasksRepositoryPort } from "../tasks/repository";
import type { CalendarRepositoryPort } from "./repository";
import type { CalendarEvent, CalendarEventCreateInput, CalendarEventListRequest, CalendarEventPage, CalendarEventStatus, CalendarEventUpdateInput } from "./types";

export interface CalendarServiceOptions { id?: () => string; now?: () => Date; tasks?: Pick<TasksRepositoryPort, "findOwned">; projects?: Pick<ProjectsRepositoryPort, "findOwned">; }

export class CalendarService {
  private readonly id: () => string;
  private readonly now: () => Date;
  constructor(private readonly repository: CalendarRepositoryPort, private readonly options: CalendarServiceOptions = {}) {
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
  }

  async create(memberId: string, input: CalendarEventCreateInput): Promise<{ event: CalendarEvent; created: boolean }> {
    const normalized = normalizeCreate(input, this.id());
    const existing = await this.repository.findByClientKey(memberId, normalized.clientKey);
    if (existing) return { event: existing, created: false };
    await this.assertRelations(memberId, normalized.taskId, normalized.projectId);
    const now = this.now().getTime();
    const created = await this.repository.insert({ ...normalized, memberId, id: normalized.id, createdAt: now, updatedAt: now });
    const event = await this.repository.findByClientKey(memberId, normalized.clientKey);
    if (!event) throw new AppError("CALENDAR_ID_CONFLICT", "Calendar creation conflicts with an existing identifier", 409, false);
    return { event, created };
  }

  async get(memberId: string, id: string): Promise<CalendarEvent> {
    const event = await this.repository.findOwned(memberId, id);
    if (!event) throw notFound();
    return event;
  }

  async listNumbered(memberId: string, from: number, to: number, request: Partial<NumberedPageRequest> = {}, status?: CalendarEventStatus): Promise<NumberedPage<CalendarEvent>> {
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from || to - from > 31 * 86_400_000) throw new AppError("CALENDAR_RANGE_INVALID", "Calendar range is invalid", 400);
    if (status !== undefined && !["scheduled", "completed", "canceled"].includes(status)) throw new AppError("CALENDAR_PAGE_INVALID", "Calendar status is invalid", 400);
    return this.repository.listNumbered(memberId, { ...normalizeNumberedPageRequest(request, "CALENDAR_PAGE_INVALID"), from, to, ...(status ? { status } : {}) });
  }

  async list(memberId: string, from: number, to: number, request: Partial<PageRequest> = {}, status?: CalendarEventStatus): Promise<CalendarEventPage> {
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from || to - from > 31 * 86_400_000) throw new AppError("CALENDAR_RANGE_INVALID", "Calendar range is invalid", 400);
    const page = parsePageRequest(request.limit, request.cursor);
    return this.repository.listOwned(memberId, { ...page, from, to, ...(status ? { status } : {}) });
  }

  async update(memberId: string, id: string, input: CalendarEventUpdateInput): Promise<CalendarEvent> {
    const existing = await this.get(memberId, id);
    const expected = requirePlanningVersion(input.expectedUpdatedAt, existing.updatedAt, "CALENDAR");
    const normalized = normalizeUpdate(input, existing);
    await this.assertRelations(memberId, normalized.taskId, normalized.projectId);
    const event = await this.repository.update(memberId, id, { ...normalized, expectedUpdatedAt: expected, updatedAt: nextPlanningVersion(expected, this.now().getTime()) });
    if (!event) throw planningConflict("CALENDAR");
    return event;
  }

  async cancel(memberId: string, id: string, expectedUpdatedAt: unknown): Promise<CalendarEvent> {
    const existing = await this.get(memberId, id);
    const expected = requirePlanningVersion(expectedUpdatedAt, existing.updatedAt, "CALENDAR");
    const event = await this.repository.updateStatus(memberId, id, "canceled", nextPlanningVersion(expected, this.now().getTime()), expected);
    if (!event) throw planningConflict("CALENDAR");
    return event;
  }

  async setStatus(memberId: string, id: string, status: unknown): Promise<CalendarEvent> {
    const existing = await this.get(memberId, id);
    if (status !== "scheduled" && status !== "completed" && status !== "canceled") throw new AppError("CALENDAR_INVALID", "Calendar status is invalid", 400);
    const event = await this.repository.updateStatus(memberId, id, status, nextPlanningVersion(Date.parse(existing.updatedAt), this.now().getTime()), Date.parse(existing.updatedAt));
    if (!event) throw planningConflict("CALENDAR");
    return event;
  }

  private async assertRelations(memberId: string, taskId: string | null, projectId: string | null): Promise<void> {
    if (taskId && this.options.tasks && !await this.options.tasks.findOwned(memberId, taskId)) throw new AppError("TASK_NOT_FOUND", "Task not found", 404);
    if (projectId && this.options.projects && !await this.options.projects.findOwned(memberId, projectId)) throw new AppError("PROJECT_NOT_FOUND", "Project not found", 404);
  }
}

function normalizeCreate(input: CalendarEventCreateInput, generatedId: string): { id: string; clientKey: string; kind: CalendarEvent["kind"]; title: string; description: string; startsAt: number; endsAt: number; timezone: string; allDay: boolean; taskId: string | null; projectId: string | null } {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const id = record.id === undefined ? generatedId : record.id;
  const clientKey = record.clientKey;
  const kind = record.kind === undefined ? "event" : record.kind;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const description = record.description === undefined || record.description === null ? "" : record.description;
  const startsAt = parseDate(record.startsAt);
  const endsAt = parseDate(record.endsAt);
  const timezone = record.timezone === undefined ? "UTC" : record.timezone;
  const allDay = record.allDay === undefined ? false : record.allDay;
  const taskId = optionalId(record.taskId);
  const projectId = optionalId(record.projectId);
  if (!validId(id) || !validId(clientKey) || (kind !== "event" && kind !== "focus") || !title || title.length > 240 || typeof description !== "string" || description.length > 4000 || typeof timezone !== "string" || timezone.length > 64 || typeof allDay !== "boolean" || endsAt <= startsAt) throw invalid();
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { throw invalid(); }
  return { id, clientKey, kind: kind as CalendarEvent["kind"], title, description, startsAt, endsAt, timezone, allDay, taskId, projectId };
}

function normalizeUpdate(input: CalendarEventUpdateInput, existing: CalendarEvent) {
  return normalizeCreate({
    id: existing.id,
    clientKey: existing.clientKey,
    kind: existing.kind,
    title: input.title === undefined ? existing.title : input.title,
    description: input.description === undefined ? existing.description : input.description,
    startsAt: input.startsAt === undefined ? existing.startsAt : input.startsAt,
    endsAt: input.endsAt === undefined ? existing.endsAt : input.endsAt,
    timezone: input.timezone === undefined ? existing.timezone : input.timezone,
    allDay: input.allDay === undefined ? existing.allDay : input.allDay,
    taskId: input.taskId === undefined ? existing.taskId : input.taskId,
    projectId: input.projectId === undefined ? existing.projectId : input.projectId,
  }, existing.id);
}
function parseDate(value: unknown): number { const ms = typeof value === "number" && Number.isSafeInteger(value) ? value : typeof value === "string" ? Date.parse(value) : NaN; if (!Number.isSafeInteger(ms) || ms <= 0 || !Number.isFinite(new Date(ms).getTime())) throw invalid(); return ms; }
function optionalId(value: unknown): string | null { if (value === undefined || value === null || value === "") return null; if (!validId(value)) throw invalid(); return value; }
function validId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value); }
function invalid(): AppError { return new AppError("CALENDAR_INVALID", "Calendar event fields are invalid", 400); }
function notFound(): AppError { return new AppError("CALENDAR_NOT_FOUND", "Calendar event not found", 404); }
