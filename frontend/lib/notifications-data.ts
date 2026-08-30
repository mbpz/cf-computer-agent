import { apiFetch, type Fetcher } from "./api";
import { createNumberedRequestController, normalizeNumberedPage, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";

export const NOTIFICATION_EVENT_TYPES = [
  "task.status_changed",
  "task.assignment_changed",
  "discussion.mention",
  "discussion.reply",
  "task.due",
  "task.overdue",
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];
export type NotificationTargetKind = "task" | "discussion_thread" | "knowledge_item";
export type NotificationPayloadValue = string | number | boolean | null;
export type NotificationPayload = Readonly<Record<string, NotificationPayloadValue>>;

export interface NotificationItem {
  id: string;
  recipientMemberId: string;
  eventType: NotificationEventType;
  actorMemberId: string | null;
  targetKind: NotificationTargetKind | null;
  targetId: string | null;
  payload: NotificationPayload;
  deduplicationKey: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationFilters {
  read?: "unread" | "read";
  eventType?: NotificationEventType;
}

export interface NotificationSummary { unread: number; }
export type NotificationPage = FrontendNumberedPage<NotificationItem>;
export interface NotificationInboxData { page: NotificationPage; summary: NotificationSummary; }

export async function loadNotifications(
  filters: NotificationFilters,
  pagination: FrontendPageRequest,
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<NotificationPage> {
  return normalizeNumberedPage(
    await apiFetch(notificationQuery(filters, pagination), { requester, signal }),
    normalizeNotification,
  );
}

export async function loadNotificationSummary(requester: Fetcher = fetch, signal?: AbortSignal): Promise<NotificationSummary> {
  const value = await apiFetch<unknown>("/api/notifications/summary", { requester, signal });
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "unread")
    || !Number.isSafeInteger(value.unread) || typeof value.unread !== "number" || value.unread < 0) {
    throw new Error("NOTIFICATION_SUMMARY_INVALID");
  }
  return { unread: value.unread };
}

export function createNotificationsRequestController(requester: Fetcher = fetch) {
  return createNumberedRequestController((input: { filters: NotificationFilters } & FrontendPageRequest, signal) =>
    Promise.all([
      loadNotifications(input.filters, input, requester, signal),
      loadNotificationSummary(requester, signal),
    ]).then(([page, summary]) => ({ page, summary })));
}

export async function markNotificationRead(id: string, requester: Fetcher = fetch): Promise<NotificationItem> {
  assertId(id, "NOTIFICATION_ID_INVALID");
  return normalizeNotification(await apiFetch<unknown>(`/api/notifications/${encodeURIComponent(id)}/read`, {
    requester,
    method: "POST",
  }));
}

export async function markVisibleNotificationsRead(ids: readonly string[], requester: Fetcher = fetch): Promise<{ marked: number }> {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100) throw new Error("NOTIFICATION_BULK_INVALID");
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    try { assertId(id, "NOTIFICATION_BULK_INVALID"); } catch { throw new Error("NOTIFICATION_BULK_INVALID"); }
    if (!seen.has(id)) { seen.add(id); unique.push(id); }
  }
  const value = await apiFetch<unknown>("/api/notifications/read", {
    requester,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: unique }),
  });
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "marked")
    || !Number.isSafeInteger(value.marked) || typeof value.marked !== "number" || value.marked < 0 || value.marked > unique.length) {
    throw new Error("NOTIFICATION_BULK_RESPONSE_INVALID");
  }
  return { marked: value.marked };
}

function notificationQuery(filters: NotificationFilters, pagination: FrontendPageRequest): string {
  const params = new URLSearchParams({ page: String(pagination.page), pageSize: String(pagination.pageSize) });
  if (filters.read) params.set("read", filters.read === "unread" ? "false" : "true");
  if (filters.eventType) params.set("type", filters.eventType);
  return `/api/notifications?${params.toString()}`;
}

function normalizeNotification(value: unknown): NotificationItem {
  if (!isRecord(value)) invalidNotification();
  const expectedKeys = ["actorMemberId", "createdAt", "deduplicationKey", "eventType", "id", "payload", "readAt", "recipientMemberId", "targetId", "targetKind"];
  if (Object.keys(value).sort().join("\0") !== expectedKeys.join("\0")) invalidNotification();
  if (!isId(value.id) || !isId(value.recipientMemberId)
    || (value.actorMemberId !== null && !isId(value.actorMemberId))
    || !NOTIFICATION_EVENT_TYPES.includes(value.eventType as NotificationEventType)
    || !isCanonicalTarget(value.targetKind, value.targetId)
    || typeof value.deduplicationKey !== "string" || !value.deduplicationKey || value.deduplicationKey.length > 256
    || (value.readAt !== null && !isCanonicalDate(value.readAt))
    || !isCanonicalDate(value.createdAt)) invalidNotification();
  const payload = normalizePayload(value.payload);
  return {
    id: value.id,
    recipientMemberId: value.recipientMemberId,
    eventType: value.eventType as NotificationEventType,
    actorMemberId: value.actorMemberId,
    targetKind: value.targetKind,
    targetId: value.targetId,
    payload,
    deduplicationKey: value.deduplicationKey,
    readAt: value.readAt,
    createdAt: value.createdAt,
  } as NotificationItem;
}

function isCanonicalTarget(targetKind: unknown, targetId: unknown): boolean {
  if (targetKind === null || targetId === null) return targetKind === null && targetId === null;
  return (targetKind === "task" || targetKind === "discussion_thread" || targetKind === "knowledge_item")
    && isId(targetId);
}

function normalizePayload(value: unknown): NotificationPayload {
  if (!isRecord(value) || Object.keys(value).length > 32) invalidNotification();
  const payload: Record<string, NotificationPayloadValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(key)
      || !(item === null || typeof item === "string" || typeof item === "boolean"
        || (typeof item === "number" && Number.isFinite(item) && Number.isSafeInteger(item)))) invalidNotification();
    payload[key] = item as NotificationPayloadValue;
  }
  return payload;
}

function assertId(value: unknown, code: string): asserts value is string {
  if (!isId(value)) throw new Error(code);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value);
}

function isCanonicalDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidNotification(): never {
  throw new Error("NOTIFICATION_RESPONSE_INVALID");
}
