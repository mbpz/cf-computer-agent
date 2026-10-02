import { useEffect, useRef, useState } from "react";
import { ConfirmAction } from "../../components/ui/confirm-action";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "../../components/ui/sheet";
import { Input } from "../../components/ui/input";
import { ApiRequestError } from "../../lib/api";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { addTaskLink, createTask, loadTaskDetail, removeTaskLink, replaceTaskTags, setTaskProgress, setTaskStatus, updateTask, type TaskDetail, type TaskItem } from "../../lib/tasks-data";
import { registerWorkspaceLeaveGuard, WORKSPACE_LOCATION_CHANGE_EVENT } from "../../lib/workspace-location";
import type { WorkspaceLeaveDecision } from "../../lib/workspace-navigation-gate";
import { taskPriorityKey, taskStatusKey } from "./tasks-model";

type Fields = { title: string; notes: string; priority: string; dueAt: string };
type Draft = { fields: Fields; tags: string; status: TaskItem["status"]; progress: string; knowledgeId: string };
type Intent = { write: () => Promise<unknown>; clean?: (keyof Draft)[]; acceptedDraft?: Draft };
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

/** Mounted per member and target. Only an explicit retry can repeat a frozen write intent. */
export function TaskEditor({ taskId, locale, onClose, onChanged, onDenied }: {
  taskId: string | null; locale: LocaleRuntime; onClose: () => void; onChanged: () => void; onDenied: (error: unknown) => void;
}) {
  const t = (key: Parameters<typeof frontendText>[1]) => frontendText(locale, key);
  const [fields, setFields] = useState<Fields>(blank);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [tags, setTags] = useState(""); const [knowledgeId, setKnowledgeId] = useState("");
  const [status, setStatus] = useState<TaskItem["status"]>("todo"); const [progress, setProgress] = useState("0");
  const [reading, setReading] = useState(taskId !== null); const [readError, setReadError] = useState(false);
  const [busy, setBusy] = useState(false); const [unknown, setUnknown] = useState(false); const [error, setError] = useState(false);
  const active = useRef(true); const gate = useRef(false); const intent = useRef<Intent | null>(null);
  const readController = useRef<AbortController | null>(null); const generation = useRef(0);
  const callbacks = useRef({ onChanged, onDenied, onClose }); callbacks.current = { onChanged, onDenied, onClose };
  const [discardDecision, setDiscardDecision] = useState<{ snapshot: string; navigation?: WorkspaceLeaveDecision } | null>(null);
  const discardRef = useRef<typeof discardDecision>(null);
  const baseline = useRef<Draft>({ fields: blank, tags: "", status: "todo", progress: "0", knowledgeId: "" });
  const currentDraft = useRef<Draft>(baseline.current);
  // Input handlers update this ref before React flushes, so same-event navigation
  // cannot observe the previous render's draft.
  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    if (gate.current || intent.current || discardRef.current) return;
    currentDraft.current = { ...currentDraft.current, [key]: value };
    const next = currentDraft.current;
    setFields(next.fields); setTags(next.tags); setStatus(next.status); setProgress(next.progress); setKnowledgeId(next.knowledgeId);
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
    currentDraft.current = { fields: blank, tags: "", status: "todo", progress: "0", knowledgeId: "" };
    baseline.current = currentDraft.current;
    clearDiscard(); setDetail(null); setFields(blank); setTags(""); setKnowledgeId(""); setStatus("todo"); setProgress("0");
    callbacks.current.onDenied(cause); return true;
  };
  async function read() {
    if (!taskId) return;
    readController.current?.abort(); const controller = new AbortController(); readController.current = controller;
    const version = ++generation.current; setReading(true); setReadError(false); setDetail(null);
    try {
      const next = await loadTaskDetail(taskId, fetch, controller.signal);
      if (!active.current || controller.signal.aborted || version !== generation.current) return;
      const loaded: Draft = { fields: { title: next.task.title, notes: next.task.notes, priority: next.task.priority, dueAt: localTaskDate(next.task.dueAt) },
        tags: next.tags.join(", "), status: next.task.status, progress: String(next.task.progress), knowledgeId: "" };
      // A subform write/readback must not erase drafts belonging to other subforms.
      const merged = Object.fromEntries((Object.keys(loaded) as (keyof Draft)[]).map(key => [key,
        JSON.stringify(currentDraft.current[key]) !== JSON.stringify(baseline.current[key]) ? currentDraft.current[key] : loaded[key],
      ])) as Draft;
      baseline.current = loaded; currentDraft.current = merged;
      setDetail(next); setFields(merged.fields); setTags(merged.tags); setStatus(merged.status); setProgress(merged.progress); setKnowledgeId(merged.knowledgeId);
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

  async function perform(next: Intent, retry = false) {
    if (discardRef.current !== null || gate.current || (intent.current && !retry)) return;
    if (!retry) next = { ...next, acceptedDraft: currentDraft.current };
    gate.current = true; intent.current = next; setBusy(true); setError(false);
    let confirmed = false;
    try {
      await next.write();
      if (!active.current) return;
      confirmed = true; intent.current = null; setUnknown(false);
      // Only an acknowledged write advances the submitted subform's baseline.
      baseline.current = { ...baseline.current, ...Object.fromEntries((next.clean ?? []).map(key => [key, next.acceptedDraft![key]])) };
    } catch (cause) {
      if (!active.current) return;
      if (denied(cause)) return;
      // An earlier uncertain attempt may already have committed, even when a retry is rejected.
      const rejected = !retry && cause instanceof ApiRequestError && cause.status >= 400 && cause.status < 500 && cause.status !== 408;
      if (rejected) { intent.current = null; setUnknown(false); setError(true); }
      else setUnknown(true);
    } finally {
      if (active.current) { setBusy(false); gate.current = false; }
    }
    if (!confirmed || !active.current) return;
    callbacks.current.onChanged();
    if (!taskId) callbacks.current.onClose();
    else await read(); // A failed read is GET-only recovery, never a repeated write.
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
    if (taskId) void perform({ clean: ["fields"], write: () => updateTask(taskId, patch) });
    else { const input = { ...patch, id: crypto.randomUUID() }; void perform({ clean: ["fields"], write: () => createTask(input) }); }
  }
  function saveTags() {
    if (!taskId || locked) return;
    const next = [...new Set(currentDraft.current.tags.split(",").map((tag) => tag.trim()).filter(Boolean))];
    if (next.length > 10 || next.some((tag) => [...tag].length > 32 || /[\u0000-\u001f\u007f-\u009f]/u.test(tag))) { setError(true); return; }
    void perform({ clean: ["tags"], write: () => replaceTaskTags(taskId, next) });
  }
  const close = () => {
    if (gate.current || intent.current || discardRef.current !== null) return;
    if (JSON.stringify(currentDraft.current) === JSON.stringify(baseline.current)) { callbacks.current.onClose(); return; }
    const decision = { snapshot: JSON.stringify([taskId, currentDraft.current]) }; discardRef.current = decision; setDiscardDecision(decision);
  };
  const discard = () => {
    if (!active.current || !confirmingDiscard || discardRef.current !== discardDecision || gate.current || intent.current) return;
    if (discardDecision.snapshot !== JSON.stringify([taskId, currentDraft.current])) { cancelDiscard(); return; }
    if (discardDecision.navigation) { discardDecision.navigation.accept(); return; }
    cancelDiscard(); callbacks.current.onClose();
  };
  const content = <div className="space-y-4" aria-busy={busy || reading}>
    {busy && <p role="status">{t("TASKS_SAVING")}</p>}
    {unknown && <div role="alert"><p>{t("TASKS_WRITE_UNKNOWN")}</p><Button disabled={busy} onClick={() => { if (intent.current) void perform(intent.current, true); }}>{t("TASKS_RETRY_WRITE")}</Button></div>}
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
        <form className="space-y-2 border-t pt-3" onSubmit={(event) => { event.preventDefault(); if (!locked) { const next = currentDraft.current.status; void perform({ clean: ["status"], write: () => setTaskStatus(taskId, next) }); } }}>
          <label>{t("TASKS_FIELD_STATUS")}<select className="block w-full rounded border bg-background p-2" aria-label={t("TASKS_FIELD_STATUS")} disabled={locked} value={status} onChange={(event) => edit("status", event.currentTarget.value as TaskItem["status"])}>{transitions[detail.task.status].map((value) => <option key={value} value={value}>{t(taskStatusKey(value))}</option>)}</select></label>
          <Button type="submit" disabled={locked}>{t("TASKS_SAVE_STATUS")}</Button>
        </form>
        <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); const progress = currentDraft.current.progress; const next = Number(progress); if (!locked && progress !== "" && Number.isInteger(next) && next >= 0 && next <= 100) void perform({ clean: ["progress"], write: () => setTaskProgress(taskId, next) }); }}>
          <label>{t("TASKS_FIELD_PROGRESS")}<Input type="number" min={0} max={100} step={1} required aria-label={t("TASKS_FIELD_PROGRESS")} value={progress} disabled={locked || ["done", "canceled"].includes(detail.task.status)} onChange={(event) => edit("progress", event.currentTarget.value)} /></label>
          <Button type="submit" disabled={locked || ["done", "canceled"].includes(detail.task.status)}>{t("TASKS_SAVE_PROGRESS")}</Button>
        </form>
        <form className="space-y-2 border-t pt-3" onSubmit={(event) => { event.preventDefault(); saveTags(); }}>
          <label>{t("TASKS_FIELD_TAGS")}<Input aria-label={t("TASKS_FIELD_TAGS")} value={tags} disabled={locked} onChange={(event) => edit("tags", event.currentTarget.value)} /></label>
          <Button type="submit" disabled={locked}>{t("TASKS_SAVE_TAGS")}</Button>
        </form>
        <form className="space-y-2 border-t pt-3" onSubmit={(event) => { event.preventDefault(); const id = currentDraft.current.knowledgeId.trim(); if (!locked && id) void perform({ clean: ["knowledgeId"], write: () => addTaskLink(taskId, id) }); }}>
          <label>{t("TASKS_LINK_ID")}<Input aria-label={t("TASKS_LINK_ID")} value={knowledgeId} required maxLength={128} disabled={locked} onChange={(event) => edit("knowledgeId", event.currentTarget.value)} /></label>
          <Button type="submit" disabled={locked || detail.links.length >= 5}>{t("TASKS_LINK_ADD")}</Button>
        </form>
        <ul className="space-y-2">{detail.links.map((link) => <li key={link.id} className="break-words rounded border p-2"><p>{link.knowledgeTitle ?? t("TASKS_LINK_UNAVAILABLE")}</p><p className="text-xs text-muted-foreground">{link.knowledgeItemId}</p><Button variant="outline" disabled={locked} aria-label={`${t("TASKS_LINK_REMOVE")}: ${link.id}`} onClick={() => void perform({ write: () => removeTaskLink(taskId, link.id) })}>{t("TASKS_LINK_REMOVE")}</Button></li>)}</ul>
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
