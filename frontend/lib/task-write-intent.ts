import { ApiRequestError } from "./api";
import { addTaskLink, createTask, deleteTask, loadTaskDetail, removeTaskLink, replaceTaskTags, setTaskProgress, setTaskStatus, updateTask, type TaskDetail, type TaskItem } from "./tasks-data";

type TaskFields = { title: string; notes: string; priority: "low" | "medium" | "high"; dueAt: string | null };
export type TaskWriteIntent =
  | { op: "create"; taskId: string; fields: TaskFields }
  | { op: "update"; taskId: string; fields: TaskFields; expectedUpdatedAt?: string }
  | { op: "status"; taskId: string; status: TaskItem["status"]; expectedStatus?: TaskItem["status"] }
  | { op: "progress"; taskId: string; progress: number }
  | { op: "tags"; taskId: string; tags: string[] }
  | { op: "link"; taskId: string; knowledgeItemId: string }
  | { op: "unlink"; taskId: string; linkId: string }
  | { op: "delete"; taskId: string };
export type StoredTaskWrite = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: TaskWriteIntent };

// Every operation is an absolute or id-keyed write, so sending the same intent again cannot add a second effect.
export function runTaskWrite(intent: TaskWriteIntent): Promise<unknown> {
  switch (intent.op) {
    case "create": return createTask({ id: intent.taskId, ...intent.fields });
    case "update": return updateTask(intent.taskId, intent.expectedUpdatedAt === undefined ? intent.fields : { ...intent.fields, expectedUpdatedAt: intent.expectedUpdatedAt });
    case "status": return setTaskStatus(intent.taskId, intent.status, fetch, intent.expectedStatus);
    case "progress": return setTaskProgress(intent.taskId, intent.progress);
    case "tags": return replaceTaskTags(intent.taskId, intent.tags);
    case "link": return addTaskLink(intent.taskId, intent.knowledgeItemId);
    case "unlink": return removeTaskLink(intent.taskId, intent.linkId);
    case "delete": return deleteTask(intent.taskId);
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
  }
}

/** Read-only reconciliation. A missing task means a delete landed and a creation did not. */
export async function checkTaskWrite(intent: TaskWriteIntent): Promise<"applied" | "not_applied" | "missing"> {
  try { return taskWriteOutcome(intent, await loadTaskDetail(intent.taskId)); }
  catch (cause) {
    if (!(cause instanceof ApiRequestError && cause.status === 404)) throw cause;
    return intent.op === "delete" ? "applied" : intent.op === "create" ? "not_applied" : "missing";
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const statuses: readonly string[] = ["todo", "doing", "blocked", "done", "canceled"];
const exactKeys = (value: object, keys: readonly string[]) => Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
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
    case "progress": return exactKeys(v, ["op", "taskId", "progress"]) && Number.isInteger(v.progress) && (v.progress as number) >= 0 && (v.progress as number) <= 100;
    case "tags": return exactKeys(v, ["op", "taskId", "tags"]) && Array.isArray(v.tags) && v.tags.length <= 10
      && v.tags.every((tag) => typeof tag === "string" && !!tag.trim() && [...tag].length <= 32);
    case "link": return exactKeys(v, ["op", "taskId", "knowledgeItemId"]) && typeof v.knowledgeItemId === "string" && ID.test(v.knowledgeItemId);
    case "unlink": return exactKeys(v, ["op", "taskId", "linkId"]) && typeof v.linkId === "string" && ID.test(v.linkId);
    case "delete": return exactKeys(v, ["op", "taskId"]);
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
