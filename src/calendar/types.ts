import type { PageRequest } from "../pagination";

export type CalendarEventKind = "event" | "focus";
export type CalendarEventStatus = "scheduled" | "completed" | "canceled";

export interface CalendarEvent {
  id: string;
  memberId: string;
  clientKey: string;
  kind: CalendarEventKind;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  allDay: boolean;
  status: CalendarEventStatus;
  taskId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEventCreateInput {
  id?: unknown;
  clientKey?: unknown;
  kind?: unknown;
  title?: unknown;
  description?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  timezone?: unknown;
  allDay?: unknown;
  taskId?: unknown;
  projectId?: unknown;
}

export interface CalendarEventUpdateInput {
  title?: unknown;
  description?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  timezone?: unknown;
  allDay?: unknown;
  taskId?: unknown;
  projectId?: unknown;
}

export interface CalendarEventListRequest extends PageRequest {
  from: number;
  to: number;
  status?: CalendarEventStatus;
}

export interface CalendarEventPage {
  items: CalendarEvent[];
  nextCursor?: string;
}
