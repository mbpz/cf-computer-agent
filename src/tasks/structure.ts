import { AppError } from "../http";
import type { TaskStatus } from "./types";

export type TaskSubtaskStatus = Exclude<TaskStatus, "blocked">;

export interface TaskSubtask {
  id: string;
  memberId: string;
  taskId: string;
  title: string;
  status: TaskSubtaskStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSubtaskCreateInput {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  position?: unknown;
}

export interface TaskSubtaskUpdateInput {
  title?: unknown;
  status?: unknown;
  position?: unknown;
}

export interface TaskDependency {
  memberId: string;
  taskId: string;
  dependsOnTaskId: string;
  createdAt: string;
}

export const TASK_SUBTASK_STATUSES: readonly TaskSubtaskStatus[] = ["todo", "doing", "done", "canceled"];

export function validStructureId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);
}

export function normalizeSubtaskCreate(input: TaskSubtaskCreateInput, generatedId: string): { id: string; title: string; status: TaskSubtaskStatus; position: number } {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const id = record.id === undefined ? generatedId : record.id;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const status = record.status === undefined ? "todo" : record.status;
  const position = record.position === undefined ? 0 : record.position;
  if (typeof id !== "string" || !validStructureId(id) || !title || [...title].length > 240 || /[\u0000-\u001f\u007f-\u009f]/u.test(title)) {
    throw new AppError("TASK_INVALID", "Task subtask fields are invalid", 400);
  }
  if (typeof status !== "string" || !TASK_SUBTASK_STATUSES.includes(status as TaskSubtaskStatus)) {
    throw new AppError("TASK_INVALID", "Task subtask fields are invalid", 400);
  }
  if (!Number.isInteger(position) || (position as number) < 0 || (position as number) > 10000) {
    throw new AppError("TASK_INVALID", "Task subtask fields are invalid", 400);
  }
  return { id, title, status: status as TaskSubtaskStatus, position: position as number };
}

export function normalizeSubtaskUpdate(input: TaskSubtaskUpdateInput): { title: string; status: TaskSubtaskStatus; position: number } {
  return normalizeSubtaskCreate(input, "subtask-update");
}
