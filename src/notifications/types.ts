import type { NumberedPage, NumberedPageRequest } from "../pagination";

export const NOTIFICATION_EVENT_TYPES = [
  "task.status_changed",
  "task.assignment_changed",
  "discussion.mention",
  "discussion.reply",
  "task.due",
  "task.overdue",
] as const;
export type NotificationEventType = typeof NOTIFICATION_EVENT_TYPES[number];

export const NOTIFICATION_TARGET_KINDS = ["task", "discussion_thread", "knowledge_item"] as const;
export type NotificationTargetKind = typeof NOTIFICATION_TARGET_KINDS[number];

export type NotificationPayloadValue = string | number | boolean | null;
export type NotificationPayload = Readonly<Record<string, NotificationPayloadValue>>;

export interface Notification {
  id: string;
  recipientMemberId: string;
  eventType: NotificationEventType;
  actorMemberId: string | null;
  targetKind: NotificationTargetKind;
  targetId: string;
  payload: NotificationPayload;
  deduplicationKey: string;
  readAt: string | null;
  createdAt: string;
}

export type NotificationView = Omit<Notification, "targetKind" | "targetId"> & {
  targetKind: NotificationTargetKind | null;
  targetId: string | null;
};

export interface NotificationInsert {
  id: string;
  recipientMemberId: string;
  eventType: NotificationEventType;
  actorMemberId: string | null;
  targetKind: NotificationTargetKind;
  targetId: string;
  payloadJson: string;
  deduplicationKey: string;
  createdAt: number;
}

export interface NotificationListFilters {
  eventType?: NotificationEventType;
  read?: boolean;
}

export interface NotificationListRequest extends NumberedPageRequest {
  filters: NotificationListFilters;
}

export type StoredNotificationPage = NumberedPage<Notification>;
export type NotificationPage = NumberedPage<NotificationView>;
export interface NotificationSummary { unread: number; }

export interface NotificationBulkReadSelection {
  ids?: readonly string[];
  eventType?: NotificationEventType;
  createdBefore?: number;
  limit: number;
}

export interface NotificationEventInput {
  recipientMemberId: unknown;
  eventType: unknown;
  actorMemberId?: unknown;
  targetKind: unknown;
  targetId: unknown;
  payload: unknown;
  deduplicationKey: unknown;
}

export interface NotificationBulkReadFilter {
  ids?: unknown;
  eventType?: unknown;
  createdBefore?: unknown;
  limit?: unknown;
}

export interface DueNotificationCandidate {
  taskId: string;
  dueAt: number;
}

export interface NotificationEmission {
  notification: Notification | null;
  created: boolean;
  suppressed: boolean;
}
