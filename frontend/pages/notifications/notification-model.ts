import { NOTIFICATION_EVENT_TYPES, type NotificationEventType, type NotificationFilters, type NotificationItem } from "../../lib/notifications-data";
import { parsePageSearch, type FrontendPageRequest } from "../../lib/numbered-page";

export interface NotificationQuery extends FrontendPageRequest { filters: NotificationFilters; }

export function parseNotificationSearch(search: string): NotificationQuery {
  const params = new URLSearchParams(search);
  const pagination = parsePageSearch(search);
  const filters: NotificationFilters = {};
  const read = singleValue(params, "read");
  const eventType = singleValue(params, "type");
  if (read === "unread" || read === "read") filters.read = read;
  if (eventType !== null && NOTIFICATION_EVENT_TYPES.includes(eventType as NotificationEventType)) {
    filters.eventType = eventType as NotificationEventType;
  }
  return { ...pagination, filters };
}

export function writeNotificationSearch(search: string, query: NotificationQuery): string {
  assertQuery(query);
  const params = new URLSearchParams(search);
  for (const key of ["page", "pageSize", "read", "type"]) params.delete(key);
  if (query.page !== 1) params.set("page", String(query.page));
  if (query.pageSize !== 20) params.set("pageSize", String(query.pageSize));
  if (query.filters.read) params.set("read", query.filters.read);
  if (query.filters.eventType) params.set("type", query.filters.eventType);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function notificationEventKey(eventType: NotificationEventType): string {
  return {
    "task.status_changed": "NOTIFICATIONS_EVENT_TASK_STATUS_CHANGED",
    "task.assignment_changed": "NOTIFICATIONS_EVENT_TASK_ASSIGNMENT_CHANGED",
    "discussion.mention": "NOTIFICATIONS_EVENT_DISCUSSION_MENTION",
    "discussion.reply": "NOTIFICATIONS_EVENT_DISCUSSION_REPLY",
    "task.due": "NOTIFICATIONS_EVENT_TASK_DUE",
    "task.overdue": "NOTIFICATIONS_EVENT_TASK_OVERDUE",
  }[eventType];
}

export function notificationTargetHref(target: Pick<NotificationItem, "targetKind" | "targetId">): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(target.targetId)) return null;
  if (target.targetKind === "knowledge_item") return `/knowledge/${encodeURIComponent(target.targetId)}`;
  if (target.targetKind === "task") return "/tasks";
  if (target.targetKind === "discussion_thread") return "/messages";
  return null;
}

function singleValue(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key);
  return values.length === 1 ? values[0]! : null;
}

function assertQuery(query: NotificationQuery): void {
  const offset = (query.page - 1) * query.pageSize;
  if (!Number.isSafeInteger(query.page) || query.page < 1 || ![20, 50, 100].includes(query.pageSize)
    || !Number.isSafeInteger(offset) || offset >= 10_000
    || (query.filters.read !== undefined && query.filters.read !== "read" && query.filters.read !== "unread")
    || (query.filters.eventType !== undefined && !NOTIFICATION_EVENT_TYPES.includes(query.filters.eventType))) {
    throw new Error("NOTIFICATION_QUERY_INVALID");
  }
}
