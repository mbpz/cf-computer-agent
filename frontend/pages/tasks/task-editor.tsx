import { useEffect, useRef, useState } from "react";
import { ConfirmAction } from "../../components/ui/confirm-action";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "../../components/ui/sheet";
import { Input } from "../../components/ui/input";
import { ApiRequestError } from "../../lib/api";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { loadDependencies, loadSubtasks, loadTaskDetail, nextSubtaskPosition, type TaskDependency, type TaskDetail, type TaskItem, type TaskSubtask } from "../../lib/tasks-data";
import { clearTaskEditorDraft, loadTaskEditorDraft, persistTaskEditorDraft, type TaskEditorDraft } from "../../lib/task-editor-draft";
import { checkTaskWrite, clearTaskWrite, runTaskWrite, saveTaskWrite, type TaskWriteIntent } from "../../lib/task-write-intent";
import { registerWorkspaceLeaveGuard, WORKSPACE_LOCATION_CHANGE_EVENT } from "../../lib/workspace-location";
import type { WorkspaceLeaveDecision } from "../../lib/workspace-navigation-gate";
import { taskPriorityKey, taskStatusKey } from "./tasks-model";

type Fields = { title: string; notes: string; priority: string; dueAt: string };
type Draft = TaskEditorDraft;
type Intent = { op: TaskWriteIntent; clean?: (keyof Draft)[]; acceptedDraft?: Draft };
type Notice = "TASKS_WRITE_CONFLICT" | "TASKS_WRITE_APPLIED" | "TASKS_WRITE_NOT_APPLIED" | "TASKS_WRITE_MISSING" | "TASKS_WRITE_CHECK_FAILED" | "TASKS_WRITE_NOT_RECORDED" | "TASKS_WRITE_RECORD_STUCK";
const cleanFor: Record<TaskWriteIntent["op"], (keyof Draft)[]> = { create: ["fields"], update: ["fields"], status: ["status"], progress: ["progress"], tags: ["tags"], link: ["knowledgeId"], unlink: [], delete: [], "subtask-create": ["subtaskTitle"], "subtask-update": [], "subtask-delete": [], "dependency-add": ["dependsOnTaskId"], "dependency-remove": [] };
const blank: Fields = { title: "", notes: "", priority: "medium", dueAt: "" };
const transitions: Record<TaskItem["status"], TaskItem["status"][]> = {
  todo: ["todo", "doing", "done", "canceled"], doing: ["doing", "todo", "blocked", "done", "canceled"],
  blocked: ["blocked", "todo", "doing", "done", "canceled"], done: ["done", "todo"], canceled: ["canceled", "todo"],
};

export function localTaskDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function intendedFields(intent: TaskWriteIntent | undefined): Fields | null {
  if (!intent || (intent.op !== "create" && intent.op !== "update")) return null;
  return { title: intent.fields.title, notes: intent.fields.notes, priority: intent.fields.priority, dueAt: localTaskDate(intent.fields.dueAt) };
}

/** Mounted per member and target. Only an explicit retry can repeat a frozen write intent; a check only reads. */
export function TaskEditor({ taskId, locale, onClose, onChanged, onDenied, memberId, restored }: {
  taskId: string | null; locale: LocaleRuntime; onClose: () => void; onChanged: () => void; onDenied: (error: unknown) => void;
  memberId?: string; restored?: TaskWriteIntent;
}) {
  const t = (key: Parameters<typeof frontendText>[1]) => frontendText(locale, key);
  const [storedDraft] = useState(() => memberId && !restored ? loadTaskEditorDraft(memberId, taskId) : { kind: "empty" as const });
  const [recordBlocked, setRecordBlocked] = useState(storedDraft.kind === "blocked");
  const [recordNotice, setRecordNotice] = useState<string>();
  const readyDraft = storedDraft.kind === "ready" ? storedDraft : null;
  const blankDraft = (): Draft => ({ fields: blank, tags: "", status: "todo", progress: "0", knowledgeId: "", subtaskTitle: "", dependsOnTaskId: "" });
  const [fields, setFields] = useState<Fields>(() => readyDraft?.draft.fields ?? intendedFields(restored) ?? blank);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [subtasks, setSubtasks] = useState<TaskSubtask[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [tags, setTags] = useState(readyDraft?.draft.tags ?? ""); const [knowledgeId, setKnowledgeId] = useState(readyDraft?.draft.knowledgeId ?? "");
  const [subtaskTitle, setSubtaskTitle] = useState(readyDraft?.draft.subtaskTitle ?? ""); const [dependsOnTaskId, setDependsOnTaskId] = useState(readyDraft?.draft.dependsOnTaskId ?? "");
  const [status, setStatus] = useState<TaskItem["status"]>(readyDraft?.draft.status ?? "todo"); const [progress, setProgress] = useState(readyDraft?.draft.progress ?? "0");
  const [reading, setReading] = useState(taskId !== null); const [readError, setReadError] = useState(false);
  const [busy, setBusy] = useState(false); const [unknown, setUnknown] = useState(restored !== undefined); const [error, setError] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const active = useRef(true); const gate = useRef(false);
  const intent = useRef<Intent | null>(restored ? { op: restored, clean: cleanFor[restored.op] } : null);
  // A creation keeps one id until it is confirmed, so a later attempt can never add a second task.
  const createId = useRef<string | null>(restored?.op === "create" ? restored.taskId : null);
  const readController = useRef<AbortController | null>(null); const generation = useRef(0);
  const callbacks = useRef({ onChanged, onDenied, onClose }); callbacks.current = { onChanged, onDenied, onClose };
  const [discardDecision, setDiscardDecision] = useState<{ snapshot: string; navigation?: WorkspaceLeaveDecision } | null>(null);
  const discardRef = useRef<typeof discardDecision>(null);
  const baseline = useRef<Draft>(readyDraft?.baseline ?? blankDraft());
  const currentDraft = useRef<Draft>(readyDraft?.draft ?? { ...baseline.current, fields: intendedFields(restored) ?? blank });
  function remember() {
    if (!memberId || recordBlocked || intent.current) return;
    const saved = persistTaskEditorDraft(memberId, taskId, baseline.current, currentDraft.current);
    setRecordNotice(saved ? undefined : t("TASKS_DRAFT_NOT_RECORDED"));
  }
  // Input handlers update this ref before React flushes, so same-event navigation
  // cannot observe the previous render's draft.
  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    if (gate.current || intent.current || discardRef.current) return;
    currentDraft.current = { ...currentDraft.current, [key]: value };
    const next = currentDraft.current;
    setFields(next.fields); setTags(next.tags); setStatus(next.status); setProgress(next.progress); setKnowledgeId(next.knowledgeId); setSubtaskTitle(next.subtaskTitle); setDependsOnTaskId(next.dependsOnTaskId);
    remember();
  }
  const snapshot = JSON.stringify([taskId, currentDraft.current]);
  const confirmingDiscard = discardDecision !== null && discardDecision.snapshot === snapshot && !busy && !unknown;
  const locked = busy || unknown || confirmingDiscard;
  const clearDiscard = () => { discardRef.current = null; setDiscardDecision(null); };
  const cancelDiscard = () => {
    const navigation = discardRef.current?.navigation;
    clearDiscard(); navigation?.cancel();
  };
  const unregisterLeave = useRef<(() => void) | null>(null);
  useEffect(() => {
    const owner = window;
    const unregister = registerWorkspaceLeaveGuard(() => {
      if (!active.current) return { kind: "allow" };
      if (gate.current || intent.current || (discardRef.current && !discardRef.current.navigation)) return { kind: "block" };
      if (JSON.stringify(currentDraft.current) === JSON.stringify(baseline.current)) return { kind: "allow" };
      const version = JSON.stringify([taskId, currentDraft.current]);
      return { kind: "confirm", version,
        prompt(navigation) { const decision = { snapshot: version, navigation }; discardRef.current = decision; setDiscardDecision(decision); },
        dismiss: clearDiscard,
      };
    });
    unregisterLeave.current = unregister;
    // A decision is not a commit: retain drafts if final revalidation fails.
    // This event is published only after an admitted explicit route write.
    const committed = () => { if (active.current) callbacks.current.onClose(); };
    owner.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, committed);
    const preventUnload = (event: BeforeUnloadEvent) => {
      if (gate.current || intent.current || JSON.stringify(currentDraft.current) !== JSON.stringify(baseline.current)) {
        event.preventDefault(); event.returnValue = "";
      }
    };
    owner.addEventListener("beforeunload", preventUnload);
    return () => {
      unregister(); if (unregisterLeave.current === unregister) unregisterLeave.current = null;
      owner.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, committed);
      owner.removeEventListener("beforeunload", preventUnload);
    };
  }, [taskId]);
  useEffect(() => { if (discardDecision !== null && !confirmingDiscard) cancelDiscard(); }, [discardDecision, confirmingDiscard]);
  useEffect(() => () => { discardRef.current = null; }, []);
  const denied = (cause: unknown) => {
    if (!(cause instanceof ApiRequestError) || (cause.status !== 401 && cause.status !== 403)) return false;
    readController.current?.abort(); generation.current += 1;
    unregisterLeave.current?.(); unregisterLeave.current = null;
    currentDraft.current = blankDraft();
    baseline.current = currentDraft.current;
    if (memberId) clearTaskEditorDraft(memberId, taskId);
    clearDiscard(); setDetail(null); setSubtasks([]); setDependencies([]); setFields(blank); setTags(""); setKnowledgeId(""); setSubtaskTitle(""); setDependsOnTaskId(""); setStatus("todo"); setProgress("0");
    callbacks.current.onDenied(cause); return true;
  };
  async function read() {
    if (!taskId) return;
    readController.current?.abort(); const controller = new AbortController(); readController.current = controller;
    const version = ++generation.current; setReading(true); setReadError(false); setDetail(null);
    try {
      const [next, nextSubtasks, nextDependencies] = await Promise.all([
        loadTaskDetail(taskId, fetch, controller.signal),
        loadSubtasks(taskId, fetch, controller.signal),
        loadDependencies(taskId, fetch, controller.signal),
      ]);
      if (!active.current || controller.signal.aborted || version !== generation.current) return;
      const loaded: Draft = { fields: { title: next.task.title, notes: next.task.notes, priority: next.task.priority, dueAt: localTaskDate(next.task.dueAt) },
        tags: next.tags.join(", "), status: next.task.status, progress: String(next.task.progress), knowledgeId: "", subtaskTitle: "", dependsOnTaskId: "" };
      // A subform write/readback must not erase drafts belonging to other subforms.
      const merged = Object.fromEntries((Object.keys(loaded) as (keyof Draft)[]).map(key => [key,
        JSON.stringify(currentDraft.current[key]) !== JSON.stringify(baseline.current[key]) ? currentDraft.current[key] : loaded[key],
      ])) as Draft;
      baseline.current = loaded; currentDraft.current = merged;
      setDetail(next); setSubtasks(nextSubtasks); setDependencies(nextDependencies);
      setFields(merged.fields); setTags(merged.tags); setStatus(merged.status); setProgress(merged.progress); setKnowledgeId(merged.knowledgeId); setSubtaskTitle(merged.subtaskTitle); setDependsOnTaskId(merged.dependsOnTaskId);
      remember();
    } catch (cause) {
      if (!active.current || controller.signal.aborted || version !== generation.current) return;
      if (!denied(cause)) setReadError(true);
    } finally { if (active.current && version === generation.current) setReading(false); }
  }
  useEffect(() => {
    active.current = true; void read();
    return () => { active.current = false; generation.current += 1; readController.current?.abort(); };
    // The route keys this component by member and task, so each mount has one target.
  }, [taskId]);

  const record = (op: TaskWriteIntent) => !memberId || saveTaskWrite(memberId, op);
  const unrecord = (op: TaskWriteIntent) => !memberId || clearTaskWrite(memberId, op);
  const acknowledge = (next: Intent) => {
    intent.current = null; setUnknown(false);
    // Only an acknowledged write advances the submitted subform's baseline.
    if (next.acceptedDraft) baseline.current = { ...baseline.current, ...Object.fromEntries((next.clean ?? []).map(key => [key, next.acceptedDraft![key]])) };
    if (next.op.op === "create") createId.current = null;
    remember();
  };
  async function perform(next: Intent, retry = false) {
    if (discardRef.current !== null || gate.current || (intent.current && !retry)) return;
    if (!retry) next = { ...next, acceptedDraft: currentDraft.current };
    if (!record(next.op)) { setError(false); setNotice("TASKS_WRITE_NOT_RECORDED"); return; }
    gate.current = true; intent.current = next; setBusy(true); setError(false); setNotice(null);
    let confirmed = false; let conflicted = false;
    try {
      await runTaskWrite(next.op);
      const cleared = unrecord(next.op);
      if (!active.current) return;
      if (!cleared) { setUnknown(true); setNotice("TASKS_WRITE_RECORD_STUCK"); return; }
      confirmed = true; acknowledge(next);
    } catch (cause) {
      // An earlier uncertain attempt may already have committed, even when a retry is rejected.
      const rejected = !retry && cause instanceof ApiRequestError && cause.status >= 400 && cause.status < 500 && cause.status !== 408 && cause.status !== 429;
      const cleared = rejected && unrecord(next.op);
      if (!active.current) return;
      // Revoked access clears private UI even on a replay. Its uncertain original
      // intent remains persisted unless this was a definite first-attempt rejection.
      if (denied(cause)) return;
      conflicted = cleared && cause instanceof ApiRequestError && cause.status === 409;
      if (conflicted) { intent.current = null; setUnknown(false); setNotice("TASKS_WRITE_CONFLICT"); }
      else if (cleared) { intent.current = null; setUnknown(false); setError(true); }
      else { setUnknown(true); if (rejected) setNotice("TASKS_WRITE_RECORD_STUCK"); }
    } finally {
      if (active.current) { setBusy(false); gate.current = false; }
    }
    // A conflict reloads the latest version; the merge keeps this subform's draft for a deliberate re-save.
    if (conflicted && active.current && taskId) { callbacks.current.onChanged(); await read(); return; }
    if (!confirmed || !active.current) return;
    callbacks.current.onChanged();
    if (!taskId) callbacks.current.onClose();
    else await read(); // A failed read is GET-only recovery, never a repeated write.
  }
  async function check() {
    const pending = intent.current;
    if (!pending || gate.current) return;
    gate.current = true; setBusy(true); setNotice(null); setError(false);
    let settled: "applied" | "not_applied" | "missing" | null = null;
    try {
      settled = await checkTaskWrite(pending.op);
      if (!active.current || intent.current !== pending) { settled = null; return; }
      if (!unrecord(pending.op)) { settled = null; setNotice("TASKS_WRITE_RECORD_STUCK"); return; }
      if (settled === "applied") acknowledge(pending);
      else { intent.current = null; setUnknown(false); }
      setNotice(settled === "applied" ? "TASKS_WRITE_APPLIED" : settled === "missing" ? "TASKS_WRITE_MISSING" : "TASKS_WRITE_NOT_APPLIED");
    } catch (cause) {
      settled = null;
      if (!active.current || denied(cause)) return;
      setNotice("TASKS_WRITE_CHECK_FAILED");
    } finally {
      if (active.current) { setBusy(false); gate.current = false; }
    }
    if (!settled || !active.current) return;
    if (settled !== "not_applied") callbacks.current.onChanged();
    if (settled === "applied" && !taskId) callbacks.current.onClose();
    else if (taskId && settled !== "missing") await read();
  }
  function save() {
    if (locked) return;
    const fields = currentDraft.current.fields;
    const title = fields.title.trim(); const notes = fields.notes.trim();
    if (!title || [...title].length > 200 || [...notes].length > 5000 || /[\u0000-\u001f\u007f-\u009f]/u.test(title + notes)) { setError(true); return; }
    const date = fields.dueAt ? new Date(fields.dueAt) : null;
    if (date && !Number.isFinite(date.getTime())) { setError(true); return; }
    // Preserve the exact original instant (including milliseconds and DST ambiguity) if unchanged.
    const dueAt = detail && fields.dueAt === localTaskDate(detail.task.dueAt) ? detail.task.dueAt : date?.toISOString() ?? null;
    const patch = { title, notes, priority: fields.priority, dueAt };
    const priority = patch.priority as "low" | "medium" | "high";
    if (taskId) void perform({ clean: ["fields"], op: { op: "update", taskId, fields: { ...patch, priority }, ...(detail ? { expectedUpdatedAt: detail.task.updatedAt } : {}) } });
    else { createId.current ??= crypto.randomUUID(); void perform({ clean: ["fields"], op: { op: "create", taskId: createId.current, fields: { ...patch, priority } } }); }
  }
  function saveTags() {
    if (!taskId || locked) return;
    const next = [...new Set(currentDraft.current.tags.split(",").map((tag) => tag.trim()).filter(Boolean))];
    if (next.length > 10 || next.some((tag) => [...tag].length > 32 || /[\u0000-\u001f\u007f-\u009f]/u.test(tag))) { setError(true); return; }
    void perform({ clean: ["tags"], op: { op: "tags", taskId, tags: next, ...(detail ? { expectedUpdatedAt: detail.task.updatedAt } : {}) } });
  }
  const close = () => {
    if (gate.current || intent.current || discardRef.current !== null) return;
    if (JSON.stringify(currentDraft.current) === JSON.stringify(baseline.current)) { callbacks.current.onClose(); return; }
    const decision = { snapshot: JSON.stringify([taskId, currentDraft.current]) }; discardRef.current = decision; setDiscardDecision(decision);
  };
  const discard = () => {
    if (!active.current || !confirmingDiscard || discardRef.current !== discardDecision || gate.current || intent.current) return;
    if (discardDecision.snapshot !== JSON.stringify([taskId, currentDraft.current])) { cancelDiscard(); return; }
    if (memberId && !clearTaskEditorDraft(memberId, taskId)) { setRecordNotice(t("TASKS_DRAFT_NOT_RECORDED")); return; }
    if (discardDecision.navigation) { discardDecision.navigation.accept(); return; }
    cancelDiscard(); callbacks.current.onClose();
  };
  const discardRecord = () => { if (!memberId || !clearTaskEditorDraft(memberId, taskId)) return; setRecordBlocked(false); };
  const content = <div className="space-y-4" aria-busy={busy || reading}>
    {recordBlocked ? <div data-task-draft-blocked role="alert"><p>{t("TASKS_DRAFT_RECORD_BLOCKED")}</p><button type="button" onClick={discardRecord}>{t("TASKS_DRAFT_RECORD_DISCARD")}</button></div> : null}
    {recordNotice ? <p role="alert">{recordNotice}</p> : null}
    {busy && <p role="status">{t("TASKS_SAVING")}</p>}
    {unknown && <div role="alert" data-task-write-unknown=""><p>{t("TASKS_WRITE_UNKNOWN")}</p><div className="mt-2 flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={() => void check()}>{t("TASKS_CHECK_WRITE")}</Button>
      <Button disabled={busy} onClick={() => { if (intent.current) void perform(intent.current, true); }}>{t("TASKS_RETRY_WRITE")}</Button>
    </div></div>}
    {notice && <p role={notice === "TASKS_WRITE_APPLIED" ? "status" : "alert"}>{t(notice)}</p>}
    {error && <p role="alert">{t("TASKS_ACTION_FAILED")} {t("TASKS_INVALID_FORM")}</p>}
    {reading ? <p role="status">{t("TASKS_LOADING")}</p> : readError ? <div role="alert"><p>{t("COMMON_UNABLE_TO_LOAD")}</p><Button onClick={() => void read()}>{t("TASKS_RELOAD_DETAIL")}</Button></div> : <>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); save(); }}>
        <label className="block">{t("TASKS_FIELD_TITLE")}<Input aria-label={t("TASKS_FIELD_TITLE")} value={fields.title} maxLength={400} required disabled={locked} onChange={(event) => edit("fields", { ...currentDraft.current.fields, title: event.currentTarget.value })} /></label>
        <label className="block">{t("TASKS_FIELD_NOTES")}<Input aria-label={t("TASKS_FIELD_NOTES")} value={fields.notes} maxLength={10000} disabled={locked} onChange={(event) => edit("fields", { ...currentDraft.current.fields, notes: event.currentTarget.value })} /></label>
        <label className="block">{t("TASKS_FIELD_PRIORITY")}<select className="block w-full rounded border bg-background p-2" aria-label={t("TASKS_FIELD_PRIORITY")} value={fields.priority} disabled={locked} onChange={(event) => edit("fields", { ...currentDraft.current.fields, priority: event.currentTarget.value })}>{(["low", "medium", "high"] as const).map((priority) => <option key={priority} value={priority}>{t(taskPriorityKey(priority))}</option>)}</select></label>
        <label className="block">{t("TASKS_FIELD_DUE")}<Input type="datetime-local" step="1" aria-label={t("TASKS_FIELD_DUE")} value={fields.dueAt} disabled={locked} onChange={(event) => edit("fields", { ...currentDraft.current.fields, dueAt: event.currentTarget.value })} /></label>
        <p className="text-sm text-muted-foreground">{t("TASKS_DUE_HINT")}</p>
        <Button type="submit" disabled={locked}>{t(taskId ? "TASKS_SAVE" : "TASKS_CREATE")}</Button>
      </form>
      {taskId && detail && <>
        <form className="space-y-2 border-t pt-3" onSubmit={(event) => { event.preventDefault(); if (!locked) { const next = currentDraft.current.status; void perform({ clean: ["status"], op: { op: "status", taskId, status: next, expectedStatus: detail.task.status } }); } }}>
          <label>{t("TASKS_FIELD_STATUS")}<select className="block w-full rounded border bg-background p-2" aria-label={t("TASKS_FIELD_STATUS")} disabled={locked} value={status} onChange={(event) => edit("status", event.currentTarget.value as TaskItem["status"])}>{transitions[detail.task.status].map((value) => <option key={value} value={value}>{t(taskStatusKey(value))}</option>)}</select></label>
          <Button type="submit" disabled={locked}>{t("TASKS_SAVE_STATUS")}</Button>
        </form>
        <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); const progress = currentDraft.current.progress; const next = Number(progress); if (!locked && progress !== "" && Number.isInteger(next) && next >= 0 && next <= 100) void perform({ clean: ["progress"], op: { op: "progress", taskId, progress: next, expectedUpdatedAt: detail.task.updatedAt } }); }}>
          <label>{t("TASKS_FIELD_PROGRESS")}<Input type="number" min={0} max={100} step={1} required aria-label={t("TASKS_FIELD_PROGRESS")} value={progress} disabled={locked || ["done", "canceled"].includes(detail.task.status)} onChange={(event) => edit("progress", event.currentTarget.value)} /></label>
          <Button type="submit" disabled={locked || ["done", "canceled"].includes(detail.task.status)}>{t("TASKS_SAVE_PROGRESS")}</Button>
        </form>
        <form className="space-y-2 border-t pt-3" onSubmit={(event) => { event.preventDefault(); saveTags(); }}>
          <label>{t("TASKS_FIELD_TAGS")}<Input aria-label={t("TASKS_FIELD_TAGS")} value={tags} disabled={locked} onChange={(event) => edit("tags", event.currentTarget.value)} /></label>
          <Button type="submit" disabled={locked}>{t("TASKS_SAVE_TAGS")}</Button>
        </form>
        <form className="space-y-2 border-t pt-3" onSubmit={(event) => { event.preventDefault(); const id = currentDraft.current.knowledgeId.trim(); if (!locked && id) void perform({ clean: ["knowledgeId"], op: { op: "link", taskId, knowledgeItemId: id, expectedUpdatedAt: detail.task.updatedAt } }); }}>
          <label>{t("TASKS_LINK_ID")}<Input aria-label={t("TASKS_LINK_ID")} value={knowledgeId} required maxLength={128} disabled={locked} onChange={(event) => edit("knowledgeId", event.currentTarget.value)} /></label>
          <Button type="submit" disabled={locked || detail.links.length >= 5}>{t("TASKS_LINK_ADD")}</Button>
        </form>
        <ul className="space-y-2">{detail.links.map((link) => <li key={link.id} className="break-words rounded border p-2"><p>{link.knowledgeTitle ?? t("TASKS_LINK_UNAVAILABLE")}</p><p className="text-xs text-muted-foreground">{link.knowledgeItemId}</p><Button variant="outline" disabled={locked} aria-label={`${t("TASKS_LINK_REMOVE")}: ${link.id}`} onClick={() => void perform({ op: { op: "unlink", taskId, linkId: link.id, expectedUpdatedAt: detail.task.updatedAt } })}>{t("TASKS_LINK_REMOVE")}</Button></li>)}</ul>
        <form className="space-y-2 border-t pt-3" onSubmit={(event) => { event.preventDefault(); const title = currentDraft.current.subtaskTitle.trim(); const position = nextSubtaskPosition(subtasks); if (locked || position === null || !title || [...title].length > 240 || /[\u0000-\u001f\u007f-\u009f]/u.test(title)) { setError(true); return; } void perform({ clean: ["subtaskTitle"], op: { op: "subtask-create", taskId, subtaskId: crypto.randomUUID(), title, status: "todo", position } }); }}>
          <label>{t("TASKS_SUBTASK_TITLE")}<Input aria-label={t("TASKS_SUBTASK_TITLE")} value={subtaskTitle} maxLength={480} disabled={locked} onChange={(event) => edit("subtaskTitle", event.currentTarget.value)} /></label>
          <Button type="submit" disabled={locked}>{t("TASKS_SUBTASK_ADD")}</Button>
        </form>
        <ul className="space-y-2">{subtasks.map((item) => <li key={item.id} className="break-words rounded border p-2"><p>{item.title}</p><label className="mt-2 block text-xs text-muted-foreground">{t("TASKS_SUBTASK_STATUS")}<select className="mt-1 block w-full rounded border bg-background p-2 text-sm text-foreground" aria-label={`${t("TASKS_SUBTASK_STATUS")}: ${item.title}`} disabled={locked} value={item.status} onChange={(event) => { const status = event.currentTarget.value as TaskSubtask["status"]; if (status !== item.status) void perform({ op: { op: "subtask-update", taskId, subtaskId: item.id, title: item.title, status, position: item.position, expectedUpdatedAt: item.updatedAt } }); }}>{(["todo", "doing", "done", "canceled"] as const).map((status) => <option key={status} value={status}>{t(taskStatusKey(status))}</option>)}</select></label><div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" disabled={locked} aria-label={`${item.status === "done" ? t("TASKS_SUBTASK_REOPEN") : t("TASKS_SUBTASK_DONE")}: ${item.title}`} onClick={() => void perform({ op: { op: "subtask-update", taskId, subtaskId: item.id, title: item.title, status: item.status === "done" ? "todo" : "done", position: item.position, expectedUpdatedAt: item.updatedAt } })}>{item.status === "done" ? t("TASKS_SUBTASK_REOPEN") : t("TASKS_SUBTASK_DONE")}</Button><Button variant="outline" disabled={locked} aria-label={`${t("TASKS_SUBTASK_REMOVE")}: ${item.title}`} onClick={() => void perform({ op: { op: "subtask-delete", taskId, subtaskId: item.id, expectedUpdatedAt: item.updatedAt } })}>{t("TASKS_SUBTASK_REMOVE")}</Button></div></li>)}</ul>
        <form className="space-y-2 border-t pt-3" onSubmit={(event) => { event.preventDefault(); const dependsOnTaskId = currentDraft.current.dependsOnTaskId.trim(); if (locked || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(dependsOnTaskId) || dependsOnTaskId === taskId) { setError(true); return; } void perform({ clean: ["dependsOnTaskId"], op: { op: "dependency-add", taskId, dependsOnTaskId, expectedUpdatedAt: detail.task.updatedAt } }); }}>
          <label>{t("TASKS_DEPENDENCY_ID")}<Input aria-label={t("TASKS_DEPENDENCY_ID")} value={dependsOnTaskId} maxLength={128} disabled={locked} onChange={(event) => edit("dependsOnTaskId", event.currentTarget.value)} /></label>
          <Button type="submit" disabled={locked}>{t("TASKS_DEPENDENCY_ADD")}</Button>
        </form>
        <ul className="space-y-2">{dependencies.map((item) => <li key={item.dependsOnTaskId} className="break-words rounded border p-2"><p className="text-xs text-muted-foreground">{item.dependsOnTaskId}</p><Button variant="outline" disabled={locked} aria-label={`${t("TASKS_DEPENDENCY_REMOVE")}: ${item.dependsOnTaskId}`} onClick={() => void perform({ op: { op: "dependency-remove", taskId, dependsOnTaskId: item.dependsOnTaskId, expectedUpdatedAt: detail.task.updatedAt } })}>{t("TASKS_DEPENDENCY_REMOVE")}</Button></li>)}</ul>
      </>}
    </>}
    <Button variant="outline" disabled={locked} onClick={close}>{t("TASKS_CLOSE")}</Button>
  </div>;
  const editor = taskId
    ? <Sheet open onOpenChange={(open) => { if (!open) close(); }}><SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" aria-labelledby="task-editor-heading"><SheetTitle id="task-editor-heading" className="mb-4">{t("TASKS_EDIT")}</SheetTitle>{content}</SheetContent></Sheet>
    : <Dialog open onOpenChange={(open) => { if (!open) close(); }}><DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto" aria-labelledby="task-editor-heading"><DialogTitle id="task-editor-heading" className="mb-4">{t("TASKS_NEW")}</DialogTitle>{content}</DialogContent></Dialog>;
  return <><div inert={confirmingDiscard} aria-hidden={confirmingDiscard || undefined}>{editor}</div>
    <ConfirmAction open={confirmingDiscard} title={t("TASKS_DISCARD_TITLE")}
      description={`${fields.title.trim() || t("TASKS_NEW")}${taskId ? ` (${taskId})` : ""}. ${t("TASKS_DISCARD_IMPACT")}`}
      cancelLabel={t("TASKS_KEEP_EDITING")} confirmLabel={t("TASKS_DISCARD_CONFIRM")}
      onCancel={cancelDiscard} onConfirm={discard} />
  </>;
}
