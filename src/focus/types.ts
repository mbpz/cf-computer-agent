export type FocusStatus = "active" | "paused" | "completed" | "abandoned";

export interface FocusSession {
  id: string;
  memberId: string;
  taskId: string;
  calendarEventId: string | null;
  clientKey: string;
  startTitle: string | null;
  durationMinutes: number | null;
  status: FocusStatus;
  startedAt: string;
  pausedAt: string | null;
  endedAt: string | null;
  elapsedMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface FocusStartInput {
  id?: unknown;
  clientKey?: unknown;
  taskId?: unknown;
  title?: unknown;
  durationMinutes?: unknown;
}
