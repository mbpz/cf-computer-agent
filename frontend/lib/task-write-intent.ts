import { ApiRequestError } from "./api";
import { addDependency, addTaskLink, createSubtask, createTask, deleteSubtask, deleteTask, loadDependencies, loadSubtasks, loadTaskDetail, removeDependency, removeTaskLink, replaceTaskTags, setTaskProgress, setTaskStatus, updateSubtask, updateTask, type TaskDetail, type TaskItem, type TaskSubtaskStatus } from "./tasks-data";

type TaskFields = { title: string; notes: string; priority: "low" | "medium" | "high"; dueAt: string | null };
export type TaskWriteIntent =
  | { op: "create"; taskId: string; fields: TaskFields }
  | { op: "update"; taskId: string; fields: TaskFields; expectedUpdatedAt?: string }
  | { op: "status"; taskId: string; status: TaskItem["status"]; expectedStatus?: TaskItem["status"] }
  | { op: "progress"; taskId: string; progress: number; expectedUpdatedAt?: string }
  | { op: "tags"; taskId: string; tags: string[]; expectedUpdatedAt?: string }
  | { op: "link"; taskId: string; knowledgeItemId: string; expectedUpdatedAt?: string }
  | { op: "unlink"; taskId: string; linkId: string; expectedUpdatedAt?: string }
  | { op: "delete"; taskId: string }
  | { op: "subtask-create"; taskId: string; subtaskId: string; title: string; status: TaskSubtaskStatus; position: number }
  | { op: "subtask-update"; taskId: string; subtaskId: string; title: string; status: TaskSubtaskStatus; position: number; expectedUpdatedAt: string }
  | { op: "subtask-delete"; taskId: string; subtaskId: string; expectedUpdatedAt: string }
  | { op: "dependency-add"; taskId: string; dependsOnTaskId: string; expectedUpdatedAt: string }
  | { op: "dependency-remove"; taskId: string; dependsOnTaskId: string; expectedUpdatedAt: string };
export type StoredTaskWrite = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: TaskWriteIntent };

// Every operation is an absolute or id-keyed write, so sending the same intent again cannot add a second effect.
export function runTaskWrite(intent: TaskWriteIntent): Promise<unknown> {
  switch (intent.op) {
    case "create": return createTask({ id: intent.taskId, ...intent.fields });
    case "update": return updateTask(intent.taskId, intent.expectedUpdatedAt === undefined ? intent.fields : { ...intent.fields, expectedUpdatedAt: intent.expectedUpdatedAt });
    case "status": return setTaskStatus(intent.taskId, intent.status, fetch, intent.expectedStatus);
    case "progress": return setTaskProgress(intent.taskId, intent.progress, fetch, intent.expectedUpdatedAt);
    case "tags": return replaceTaskTags(intent.taskId, intent.tags, fetch, intent.expectedUpdatedAt);
    case "link": return addTaskLink(intent.taskId, intent.knowledgeItemId, fetch, intent.expectedUpdatedAt);
    case "unlink": return removeTaskLink(intent.taskId, intent.linkId, fetch, intent.expectedUpdatedAt);
    case "delete": return deleteTask(intent.taskId);
    case "subtask-create": return createSubtask(intent.taskId, { id: intent.subtaskId, title: intent.title, status: intent.status, position: intent.position });
    case "subtask-update": return updateSubtask(intent.taskId, intent.subtaskId, { title: intent.title, status: intent.status, position: intent.position, expectedUpdatedAt: intent.expectedUpdatedAt });
    case "subtask-delete": return deleteSubtask(intent.taskId, intent.subtaskId, intent.expectedUpdatedAt);
    case "dependency-add": return addDependency(intent.taskId, intent.dependsOnTaskId, intent.expectedUpdatedAt);
    case "dependency-remove": return removeDependency(intent.taskId, intent.dependsOnTaskId, intent.expectedUpdatedAt);
  }
}

/** Compares a fresh read with the intended outcome. "not_applied" may also mean it changed elsewhere afterwards. */
export function taskWriteOutcome(intent: TaskWriteIntent, detail: TaskDetail): "applied" | "not_applied" {
  const task = detail.task;
  const sameInstant = (a: string | null, b: string | null) => a === b || (a !== null && b !== null && Date.parse(a) === Date.parse(b));
  switch (intent.op) {
    case "create":
    case "update": {
      const f = intent.fields;
      return task.title === f.title && task.notes === f.notes && task.priority === f.priority && sameInstant(task.dueAt, f.dueAt) ? "applied" : "not_applied";
    }
    case "status": return task.status === intent.status ? "applied" : "not_applied";
    case "progress": return task.progress === intent.progress ? "applied" : "not_applied";
    case "tags": {
      const want = [...new Set(intent.tags.map((tag) => tag.trim()).filter(Boolean))].sort();
      const have = [...detail.tags].sort();
      return want.length === have.length && want.every((tag, index) => tag === have[index]) ? "applied" : "not_applied";
    }
    case "link": return detail.links.some((link) => link.knowledgeItemId === intent.knowledgeItemId) ? "applied" : "not_applied";
    case "unlink": return detail.links.some((link) => link.id === intent.linkId) ? "not_applied" : "applied";
    case "delete": return "not_applied";
    // Subtasks and dependencies are not on the task detail. checkTaskWrite reads them directly.
    case "subtask-create":
    case "subtask-update":
    case "subtask-delete":
    case "dependency-add":
    case "dependency-remove": return "not_applied";
  }
}

/** Read-only reconciliation. A missing task means a delete landed and a creation did not. */
export async function checkTaskWrite(intent: TaskWriteIntent): Promise<"applied" | "not_applied" | "missing"> {
  if (intent.op === "subtask-create" || intent.op === "subtask-update" || intent.op === "subtask-delete") return checkSubtaskWrite(intent);
  if (intent.op === "dependency-add" || intent.op === "dependency-remove") return checkDependencyWrite(intent);
  try { return taskWriteOutcome(intent, await loadTaskDetail(intent.taskId)); }
  catch (cause) {
    if (!(cause instanceof ApiRequestError && cause.status === 404)) throw cause;
    return intent.op === "delete" ? "applied" : intent.op === "create" ? "not_applied" : "missing";
  }
}
async function checkSubtaskWrite(intent: Extract<TaskWriteIntent, { op: "subtask-create" | "subtask-update" | "subtask-delete" }>): Promise<"applied" | "not_applied" | "missing"> {
  try {
    const found = (await loadSubtasks(intent.taskId)).find((item) => item.id === intent.subtaskId);
    if (intent.op === "subtask-delete") return found ? "not_applied" : "applied";
    if (!found) return intent.op === "subtask-create" ? "not_applied" : "missing";
    return found.title === intent.title && found.status === intent.status && found.position === intent.position ? "applied" : "not_applied";
  } catch (cause) {
    if (!(cause instanceof ApiRequestError && cause.status === 404)) throw cause;
    return intent.op === "subtask-delete" ? "applied" : intent.op === "subtask-create" ? "not_applied" : "missing";
  }
}
async function checkDependencyWrite(intent: Extract<TaskWriteIntent, { op: "dependency-add" | "dependency-remove" }>): Promise<"applied" | "not_applied" | "missing"> {
  try {
    const found = (await loadDependencies(intent.taskId)).some((item) => item.dependsOnTaskId === intent.dependsOnTaskId);
    return intent.op === "dependency-remove" ? (found ? "not_applied" : "applied") : (found ? "applied" : "not_applied");
  } catch (cause) {
    if (!(cause instanceof ApiRequestError && cause.status === 404)) throw cause;
    return intent.op === "dependency-remove" ? "applied" : "not_applied";
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const statuses: readonly string[] = ["todo", "doing", "blocked", "done", "canceled"];
const subtaskStatuses: readonly string[] = ["todo", "doing", "done", "canceled"];
const versioned = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const structureId = (value: unknown) => typeof value === "string" && ID.test(value);
const subtaskBody = (value: Record<string, unknown>) => structureId(value.subtaskId) && typeof value.title === "string" && !!value.title.trim() && [...value.title].length <= 240
  && typeof value.status === "string" && subtaskStatuses.includes(value.status) && Number.isInteger(value.position) && (value.position as number) >= 0 && (value.position as number) <= 10000;
const exactKeys = (value: object, keys: readonly string[]) => Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
function optionalVersion(value: Record<string, unknown>, keys: readonly string[]): boolean {
  if (exactKeys(value, keys)) return true;
  return exactKeys(value, [...keys, "expectedUpdatedAt"]) && typeof value.expectedUpdatedAt === "string" && Number.isFinite(Date.parse(value.expectedUpdatedAt));
}
function validFields(value: unknown): value is TaskFields {
  if (!value || typeof value !== "object" || Array.isArray(value) || !exactKeys(value, ["title", "notes", "priority", "dueAt"])) return false;
  const v = value as TaskFields;
  return typeof v.title === "string" && !!v.title.trim() && [...v.title].length <= 200 && typeof v.notes === "string" && [...v.notes].length <= 5000
    && ["low", "medium", "high"].includes(v.priority) && (v.dueAt === null || (typeof v.dueAt === "string" && Number.isFinite(Date.parse(v.dueAt))));
}
export function validTaskWrite(value: unknown): value is TaskWriteIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.taskId !== "string" || !ID.test(v.taskId)) return false;
  switch (v.op) {
    case "create": return exactKeys(v, ["op", "taskId", "fields"]) && validFields(v.fields);
    case "update": return (exactKeys(v, ["op", "taskId", "fields"]) || (exactKeys(v, ["op", "taskId", "fields", "expectedUpdatedAt"])
      && typeof v.expectedUpdatedAt === "string" && Number.isFinite(Date.parse(v.expectedUpdatedAt)))) && validFields(v.fields);
    case "status": return (exactKeys(v, ["op", "taskId", "status"]) || (exactKeys(v, ["op", "taskId", "status", "expectedStatus"])
      && typeof v.expectedStatus === "string" && statuses.includes(v.expectedStatus))) && typeof v.status === "string" && statuses.includes(v.status);
    case "progress": return optionalVersion(v, ["op", "taskId", "progress"]) && Number.isInteger(v.progress) && (v.progress as number) >= 0 && (v.progress as number) <= 100;
    case "tags": return optionalVersion(v, ["op", "taskId", "tags"]) && Array.isArray(v.tags) && v.tags.length <= 10
      && v.tags.every((tag) => typeof tag === "string" && !!tag.trim() && [...tag].length <= 32);
    case "link": return optionalVersion(v, ["op", "taskId", "knowledgeItemId"]) && typeof v.knowledgeItemId === "string" && ID.test(v.knowledgeItemId);
    case "unlink": return optionalVersion(v, ["op", "taskId", "linkId"]) && typeof v.linkId === "string" && ID.test(v.linkId);
    case "delete": return exactKeys(v, ["op", "taskId"]);
    case "subtask-create": return exactKeys(v, ["op", "taskId", "subtaskId", "title", "status", "position"]) && subtaskBody(v);
    case "subtask-update": return exactKeys(v, ["op", "taskId", "subtaskId", "title", "status", "position", "expectedUpdatedAt"]) && subtaskBody(v) && versioned(v.expectedUpdatedAt);
    case "subtask-delete": return exactKeys(v, ["op", "taskId", "subtaskId", "expectedUpdatedAt"]) && structureId(v.subtaskId) && versioned(v.expectedUpdatedAt);
    case "dependency-add":
    case "dependency-remove": return exactKeys(v, ["op", "taskId", "dependsOnTaskId", "expectedUpdatedAt"]) && structureId(v.dependsOnTaskId) && v.dependsOnTaskId !== v.taskId && versioned(v.expectedUpdatedAt);
    default: return false;
  }
}

const storageKey = (memberId: string) => `memory-garden:task-write:v1:${encodeURIComponent(memberId)}`;
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("TASK_STORAGE_UNAVAILABLE");
  return value;
}
// Tab-scoped, member-scoped session storage: survives refresh/navigation, not tab closure.
// Written before sending, so a refresh while the result is unknown still knows what to reconcile.
export function loadTaskWrite(memberId: string): StoredTaskWrite {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 64_000) return { kind: "blocked" };
    const v = JSON.parse(raw);
    if (!v || v.version !== 1 || v.memberId !== memberId || !validTaskWrite(v.intent) || !exactKeys(v, ["version", "memberId", "intent"])) return { kind: "blocked" };
    return { kind: "ready", intent: Object.freeze(v.intent) };
  } catch { return { kind: "blocked" }; }
}
const same = (a: TaskWriteIntent, b: TaskWriteIntent) => JSON.stringify(a) === JSON.stringify(b);
export function saveTaskWrite(memberId: string, intent: TaskWriteIntent): boolean {
  try {
    if (!validTaskWrite(intent)) return false;
    const previous = loadTaskWrite(memberId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent))) return false;
    storage().setItem(storageKey(memberId), JSON.stringify({ version: 1, memberId, intent }));
    const saved = loadTaskWrite(memberId);
    return saved.kind === "ready" && same(saved.intent, intent);
  } catch { return false; }
}
export function clearTaskWrite(memberId: string, intent: TaskWriteIntent): boolean {
  try {
    const previous = loadTaskWrite(memberId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent))) return false;
    storage().removeItem(storageKey(memberId));
    return storage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}
// Only for an unreadable record the member explicitly chose to discard; it cannot be reconciled.
export function discardBlockedTaskWrite(memberId: string): boolean {
  try {
    if (!memberId || loadTaskWrite(memberId).kind !== "blocked") return false;
    storage().removeItem(storageKey(memberId));
    return storage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}
