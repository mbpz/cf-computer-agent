export type TaskEditorDraftFields = { readonly title: string; readonly notes: string; readonly priority: string; readonly dueAt: string };
export type TaskEditorDraft = {
  readonly fields: TaskEditorDraftFields;
  readonly tags: string;
  readonly status: "todo" | "doing" | "blocked" | "done" | "canceled";
  readonly progress: string;
  readonly knowledgeId: string;
  readonly subtaskTitle: string;
  readonly dependsOnTaskId: string;
};
export type StoredTaskEditorDraft = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; baseline: TaskEditorDraft; draft: TaskEditorDraft };
const storageKey = (memberId: string, taskId: string | null) => `memory-garden:task-editor-draft:v1:${encodeURIComponent(memberId)}:${taskId === null ? "create" : `task:${encodeURIComponent(taskId)}`}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_RAW = 64_000;
const STATUSES = ["todo", "doing", "blocked", "done", "canceled"] as const;
const PRIORITIES = ["low", "medium", "high"] as const;

function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("TASK_EDITOR_DRAFT_STORAGE_UNAVAILABLE");
  return value;
}
const text = (value: unknown, max: number): value is string => typeof value === "string" && [...value].length <= max
  && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);

function validDraft(value: unknown): value is TaskEditorDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 7 || !record.fields || typeof record.fields !== "object" || Array.isArray(record.fields)) return false;
  const fields = record.fields as Record<string, unknown>;
  if (Object.keys(fields).length !== 4 || !text(fields.title, 400) || !text(fields.notes, 10_000)
    || !PRIORITIES.includes(fields.priority as typeof PRIORITIES[number]) || !text(fields.dueAt, 32)) return false;
  return text(record.tags, 400) && STATUSES.includes(record.status as typeof STATUSES[number])
    && typeof record.progress === "string" && (record.progress === "" || /^(100|[1-9]?\d)$/u.test(record.progress))
    && text(record.knowledgeId, 128) && text(record.subtaskTitle, 480) && text(record.dependsOnTaskId, 128);
}
function plain(draft: TaskEditorDraft): TaskEditorDraft {
  return {
    fields: { title: draft.fields.title, notes: draft.fields.notes, priority: draft.fields.priority, dueAt: draft.fields.dueAt },
    tags: draft.tags, status: draft.status, progress: draft.progress, knowledgeId: draft.knowledgeId,
    subtaskTitle: draft.subtaskTitle, dependsOnTaskId: draft.dependsOnTaskId,
  };
}

// Tab-scoped draft for an open task editor. The baseline is the form the draft was edited from,
// so a later read can keep only the fields the member actually changed. Restoring never writes.
export function loadTaskEditorDraft(memberId: string, taskId: string | null): StoredTaskEditorDraft {
  try {
    if (!idPattern.test(memberId) || (taskId !== null && !idPattern.test(taskId))) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId, taskId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || value.target !== (taskId ?? "create")
      || Object.keys(value).length !== 5 || !validDraft(value.baseline) || !validDraft(value.draft)) return { kind: "blocked" };
    return { kind: "ready", baseline: Object.freeze(plain(value.baseline)), draft: Object.freeze(plain(value.draft)) };
  } catch { return { kind: "blocked" }; }
}

export function persistTaskEditorDraft(memberId: string, taskId: string | null, baseline: TaskEditorDraft, draft: TaskEditorDraft): boolean {
  try {
    if (!idPattern.test(memberId) || (taskId !== null && !idPattern.test(taskId))) return false;
    if (JSON.stringify(baseline) === JSON.stringify(draft)) { storage().removeItem(storageKey(memberId, taskId)); return true; }
    if (!validDraft(baseline) || !validDraft(draft)) return false;
    const body = JSON.stringify({ version: 1, memberId, target: taskId ?? "create", baseline: plain(baseline), draft: plain(draft) });
    if (body.length > MAX_RAW) return false;
    storage().setItem(storageKey(memberId, taskId), body);
    return true;
  } catch { return false; }
}

export function clearTaskEditorDraft(memberId: string, taskId: string | null): boolean {
  try {
    if (!idPattern.test(memberId) || (taskId !== null && !idPattern.test(taskId))) return false;
    storage().removeItem(storageKey(memberId, taskId));
    return true;
  } catch { return false; }
}
