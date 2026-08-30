import { APP_CONFIG } from "../config";
import { AppError } from "../http";
import { normalizeNumberedPageRequest, type NumberedPageRequest } from "../pagination";
import type { NotificationsRepositoryPort } from "./repository";
import {
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_TARGET_KINDS,
  type DueNotificationCandidate,
  type Notification,
  type NotificationBulkReadFilter,
  type NotificationBulkReadSelection,
  type NotificationEmission,
  type NotificationEventInput,
  type NotificationEventType,
  type NotificationListFilters,
  type NotificationPage,
  type NotificationPayload,
  type NotificationPayloadValue,
  type NotificationSummary,
  type NotificationTargetKind,
} from "./types";

const DAY = 86_400_000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const PAYLOAD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;

export interface NotificationTargetAuthorizer {
  canReadTarget(recipientMemberId: string, targetKind: NotificationTargetKind, targetId: string): Promise<boolean>;
}

export interface DueNotificationSource {
  listDueCandidates(recipientMemberId: string, observedAt: number, limit: number): Promise<DueNotificationCandidate[]>;
}

export interface NotificationsServiceOptions {
  id?: () => string;
  now?: () => Date;
  targetAuthorizer: NotificationTargetAuthorizer;
  dueSource?: DueNotificationSource;
}

export class NotificationsService {
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly repository: NotificationsRepositoryPort,
    private readonly options: NotificationsServiceOptions,
  ) {
    this.id = options.id ?? (() => crypto.randomUUID());
    this.now = options.now ?? (() => new Date());
  }

  async list(
    memberId: string,
    filters: NotificationListFilters = {},
    page: Partial<NumberedPageRequest> = {},
  ): Promise<NotificationPage> {
    const recipientMemberId = normalizeId(memberId);
    const pagination = normalizeNumberedPageRequest(page, "NOTIFICATION_PAGE_INVALID");
    const normalizedFilters = normalizeListFilters(filters);
    await this.materializeDue(recipientMemberId);
    return this.repository.list(recipientMemberId, {
      ...pagination,
      filters: normalizedFilters,
    });
  }

  async summary(memberId: string): Promise<NotificationSummary> {
    const recipientMemberId = normalizeId(memberId);
    await this.materializeDue(recipientMemberId);
    return this.repository.summary(recipientMemberId);
  }

  async markRead(memberId: string, id: string): Promise<Notification> {
    const recipientMemberId = normalizeId(memberId);
    const notificationId = normalizeId(id);
    await this.repository.markRead(recipientMemberId, notificationId, this.now().getTime());
    const notification = await this.repository.findOwned(recipientMemberId, notificationId);
    if (!notification) throw notFound();
    return notification;
  }

  async markManyRead(memberId: string, boundedFilter: NotificationBulkReadFilter): Promise<{ marked: number }> {
    const recipientMemberId = normalizeId(memberId);
    const selection = normalizeBulkFilter(boundedFilter);
    return { marked: await this.repository.markManyRead(recipientMemberId, selection, this.now().getTime()) };
  }

  async emit(event: NotificationEventInput): Promise<NotificationEmission> {
    const normalized = normalizeEvent(event);
    if (!await this.options.targetAuthorizer.canReadTarget(
      normalized.recipientMemberId,
      normalized.targetKind,
      normalized.targetId,
    )) {
      return { notification: null, created: false, suppressed: true };
    }
    const created = await this.repository.insert({
      id: this.id(),
      recipientMemberId: normalized.recipientMemberId,
      eventType: normalized.eventType,
      actorMemberId: normalized.actorMemberId,
      targetKind: normalized.targetKind,
      targetId: normalized.targetId,
      payloadJson: normalized.payloadJson,
      deduplicationKey: normalized.deduplicationKey,
      createdAt: this.now().getTime(),
    });
    const notification = await this.repository.findByDeduplicationKey(
      normalized.recipientMemberId,
      normalized.deduplicationKey,
    );
    if (!notification) throw new AppError("NOTIFICATION_WRITE_FAILED", "Notification write failed", 500, true);
    return { notification, created, suppressed: false };
  }

  private async materializeDue(recipientMemberId: string): Promise<void> {
    if (!this.options.dueSource) return;
    const observedAt = this.now().getTime();
    const startOfDay = observedAt - (observedAt % DAY);
    const candidates = await this.options.dueSource.listDueCandidates(
      recipientMemberId,
      observedAt,
      APP_CONFIG.maxNotificationDueMaterialization,
    );
    for (const candidate of candidates.slice(0, APP_CONFIG.maxNotificationDueMaterialization)) {
      const taskId = normalizeId(candidate.taskId);
      if (!Number.isSafeInteger(candidate.dueAt) || candidate.dueAt <= 0) throw invalidEvent();
      const state = candidate.dueAt < startOfDay ? "overdue" : "due";
      await this.emit({
        recipientMemberId,
        eventType: `task.${state}`,
        actorMemberId: null,
        targetKind: "task",
        targetId: taskId,
        payload: { dueAt: new Date(candidate.dueAt).toISOString() },
        deduplicationKey: `task:${taskId}:${state}:${candidate.dueAt}`,
      });
    }
  }
}

function normalizeEvent(event: NotificationEventInput): {
  recipientMemberId: string;
  eventType: NotificationEventType;
  actorMemberId: string | null;
  targetKind: NotificationTargetKind;
  targetId: string;
  payloadJson: string;
  deduplicationKey: string;
} {
  if (!event || typeof event !== "object") throw invalidEvent();
  const recipientMemberId = normalizeId(event.recipientMemberId);
  const eventType = normalizeEnum(event.eventType, NOTIFICATION_EVENT_TYPES);
  const actorMemberId = event.actorMemberId === undefined || event.actorMemberId === null
    ? null
    : normalizeId(event.actorMemberId);
  const targetKind = normalizeEnum(event.targetKind, NOTIFICATION_TARGET_KINDS);
  const targetId = normalizeId(event.targetId);
  const deduplicationKey = normalizeBoundedString(event.deduplicationKey, 256);
  const payloadJson = canonicalizePayload(event.payload);
  return { recipientMemberId, eventType, actorMemberId, targetKind, targetId, payloadJson, deduplicationKey };
}

function normalizeListFilters(filters: NotificationListFilters): NotificationListFilters {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) throw invalidPage();
  const normalized: NotificationListFilters = {};
  if (filters.eventType !== undefined) normalized.eventType = normalizeEnum(filters.eventType, NOTIFICATION_EVENT_TYPES);
  if (filters.read !== undefined) {
    if (typeof filters.read !== "boolean") throw invalidPage();
    normalized.read = filters.read;
  }
  return normalized;
}

function normalizeBulkFilter(input: NotificationBulkReadFilter): NotificationBulkReadSelection {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalidBulk();
  const limit = input.limit === undefined ? APP_CONFIG.maxNotificationBulkRead : input.limit;
  if (!Number.isSafeInteger(limit) || typeof limit !== "number" || limit < 1 || limit > APP_CONFIG.maxNotificationBulkRead) throw invalidBulk();
  const selection: NotificationBulkReadSelection = { limit };
  if (input.ids !== undefined) {
    if (!Array.isArray(input.ids) || input.ids.length > APP_CONFIG.maxNotificationBulkRead) throw invalidBulk();
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const value of input.ids) {
      const id = normalizeIdForBulk(value);
      if (!seen.has(id)) { seen.add(id); ids.push(id); }
    }
    selection.ids = ids;
  }
  if (input.eventType !== undefined) selection.eventType = normalizeEnumForBulk(input.eventType, NOTIFICATION_EVENT_TYPES);
  if (input.createdBefore !== undefined) {
    const value = typeof input.createdBefore === "number" ? input.createdBefore : typeof input.createdBefore === "string" ? Date.parse(input.createdBefore) : Number.NaN;
    if (!Number.isSafeInteger(value) || value <= 0) throw invalidBulk();
    selection.createdBefore = value;
  }
  return selection;
}

function canonicalizePayload(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw invalidEvent();
  const entries = Object.entries(payload).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length > APP_CONFIG.maxNotificationPayloadKeys) throw invalidEvent();
  const normalized: Record<string, NotificationPayloadValue> = {};
  for (const [key, value] of entries) {
    if (!PAYLOAD_KEY_PATTERN.test(key) || !isPayloadValue(value)) throw invalidEvent();
    normalized[key] = value;
  }
  const json = JSON.stringify(normalized satisfies NotificationPayload);
  if (new TextEncoder().encode(json).byteLength > APP_CONFIG.maxNotificationPayloadBytes) throw invalidEvent();
  return json;
}

function isPayloadValue(value: unknown): value is NotificationPayloadValue {
  return value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value) && Number.isSafeInteger(value));
}

function normalizeId(value: unknown): string {
  if (typeof value !== "string") throw invalidEvent();
  const normalized = value.trim();
  if (!ID_PATTERN.test(normalized)) throw invalidEvent();
  return normalized;
}

function normalizeBoundedString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") throw invalidEvent();
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f-\u009f]/u.test(normalized)) throw invalidEvent();
  return normalized;
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string") throw invalidEvent();
  const normalized = value.trim();
  if (!allowed.includes(normalized as T)) throw invalidEvent();
  return normalized as T;
}

function normalizeIdForBulk(value: unknown): string {
  try { return normalizeId(value); } catch { throw invalidBulk(); }
}

function normalizeEnumForBulk<T extends string>(value: unknown, allowed: readonly T[]): T {
  try { return normalizeEnum(value, allowed); } catch { throw invalidBulk(); }
}

function invalidEvent(): AppError {
  return new AppError("NOTIFICATION_EVENT_INVALID", "Notification event is invalid", 400);
}

function invalidPage(): AppError {
  return new AppError("NOTIFICATION_PAGE_INVALID", "Notification filters are invalid", 400);
}

function invalidBulk(): AppError {
  return new AppError("NOTIFICATION_BULK_INVALID", "Notification bulk read is invalid", 400);
}

function notFound(): AppError {
  return new AppError("NOTIFICATION_NOT_FOUND", "Notification not found", 404);
}
