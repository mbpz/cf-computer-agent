import { useEffect, useRef, useState } from "react";
import { ConfirmAction } from "./ui/confirm-action";
import { registerWorkspaceLeaveGuard, WORKSPACE_LOCATION_CHANGE_EVENT } from "../lib/workspace-location";
import type { WorkspaceLeaveDecision } from "../lib/workspace-navigation-gate";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { ProjectTimelineItem, TimelineEditContent } from "../lib/projects-data";

function localTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, -1);
}
function isoTime(value: string): string | null | undefined {
  if (!value) return null;
  const epoch = new Date(value).getTime();
  return Number.isFinite(epoch) ? new Date(epoch).toISOString() : undefined;
}
export function TimelineItemEditor({ locale, item, pending, onSave }: {
  locale: LocaleRuntime; item: ProjectTimelineItem; pending: boolean;
  onSave: (item: ProjectTimelineItem, content: TimelineEditContent) => Promise<boolean>;
}) {
  type Fields = { title: string; body: string; kind: ProjectTimelineItem["kind"]; startsAt: string; dueAt: string };
  type Editor = { original: ProjectTimelineItem; fields: Fields; baseline: Fields };
  type Decision = { version: string; navigation?: WorkspaceLeaveDecision };
  const [editor, setEditor] = useState<Editor | null>(null);
  const current = useRef<Editor | null>(null);
  const liveProps = useRef({ item, pending, onSave }); liveProps.current = { item, pending, onSave };
  const [decision, setDecision] = useState<Decision | null>(null);
  const decisionRef = useRef<Decision | null>(null);
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const alive = useRef(true);
  const titleInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const original = editor?.original;
  const blocked = () => submitting.current || liveProps.current.pending;
  const version = () => JSON.stringify(current.current);
  const dirty = () => !!current.current && JSON.stringify(current.current.fields) !== JSON.stringify(current.current.baseline);
  const dismiss = () => { decisionRef.current = null; if (alive.current) setDecision(null); };
  const close = () => { current.current = null; setEditor(null); setSaveFailed(false); };
  const prompt = (navigation?: WorkspaceLeaveDecision) => {
    const next = { version: version(), navigation }; decisionRef.current = next; setDecision(next);
  };
  useEffect(() => {
    if (original) titleInput.current?.focus();
    else if (wasEditing.current) editButton.current?.focus();
    wasEditing.current = original !== undefined;
  }, [original]);
  useEffect(() => {
    alive.current = true;
    const owner = window;
    const unregister = registerWorkspaceLeaveGuard(() => {
      if (!alive.current || !current.current) return { kind: "allow" };
      if (blocked() || (decisionRef.current && !decisionRef.current.navigation)) return { kind: "block" };
      if (!dirty()) return { kind: "allow" };
      return { kind: "confirm", version: version(), prompt, dismiss };
    });
    const committed = () => { if (alive.current && current.current && !blocked()) close(); };
    const warn = (event: BeforeUnloadEvent) => {
      if (current.current && (dirty() || blocked())) { event.preventDefault(); event.returnValue = ""; }
    };
    owner.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, committed);
    owner.addEventListener("beforeunload", warn);
    return () => {
      alive.current = false; unregister(); decisionRef.current = null;
      owner.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, committed);
      owner.removeEventListener("beforeunload", warn);
    };
  }, []);
  const requestClose = () => {
    if (!alive.current || !current.current || blocked() || decisionRef.current) return;
    if (dirty()) prompt(); else close();
  };
  const cancelDecision = () => { const next = decisionRef.current; if (next?.navigation) next.navigation.cancel(); else dismiss(); };
  const confirmDecision = () => {
    if (!alive.current || !decision || decisionRef.current !== decision) return;
    if (blocked() || decision.version !== version()) { cancelDecision(); return; }
    if (decision.navigation) decision.navigation.accept();
    else { dismiss(); close(); }
  };
  const edit = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    if (!alive.current || !current.current || blocked() || decisionRef.current) return;
    const next = { ...current.current, fields: { ...current.current.fields, [key]: value } };
    current.current = next; setEditor(next);
  };
  function content(snapshot: Editor): TimelineEditContent | null {
    const { original, fields: { title, body, kind, startsAt, dueAt } } = snapshot;
    // Preserve untouched instants exactly, including ambiguous DST local times.
    const start = startsAt === localTime(original.startsAt) ? original.startsAt : isoTime(startsAt);
    const due = dueAt === localTime(original.dueAt) ? original.dueAt : isoTime(dueAt);
    if (!title.trim() || title.trim().length > 200 || body.length > 200_000 || start === undefined || due === undefined || !!(start && due && Date.parse(due) < Date.parse(start))) return null;
    return { title: title.trim(), body, kind, startsAt: start, dueAt: due };
  }
  async function save() {
    const snapshot = current.current;
    if (!alive.current || !snapshot || blocked() || decisionRef.current || snapshot.original.id !== liveProps.current.item.id || snapshot.original.updatedAt !== liveProps.current.item.updatedAt) return;
    const next = content(snapshot); if (!next) return;
    submitting.current = true; setSaving(true); setSaveFailed(false);
    try {
      const success = await liveProps.current.onSave(snapshot.original, next);
      if (alive.current && current.current === snapshot && success) close();
    } catch { if (alive.current && current.current === snapshot) setSaveFailed(true); }
    finally { submitting.current = false; if (alive.current) setSaving(false); }
  }
  if (!editor) return <Button ref={editButton} type="button" size="sm" variant="outline" disabled={pending} onClick={() => {
    if (!alive.current || current.current || blocked()) return;
    const item = liveProps.current.item;
    const fields = { title: item.title, body: item.body, kind: item.kind, startsAt: localTime(item.startsAt), dueAt: localTime(item.dueAt) };
    const next = { original: item, fields, baseline: fields }; current.current = next; setEditor(next);
  }}>{frontendText(locale, "PROJECT_TIMELINE_EDIT")}</Button>;
  const { title, body, kind, startsAt, dueAt } = editor.fields;
  const invalid = !content(editor);
  const stale = editor.original.id !== item.id || editor.original.updatedAt !== item.updatedAt;
  const locked = pending || saving || !!decision;
  return <div className="space-y-3 rounded-md border p-3" onKeyDown={event => {
    if (event.key === "Escape" && !event.defaultPrevented && !decisionRef.current) { event.preventDefault(); event.stopPropagation(); requestClose(); }
  }}>
    <fieldset disabled={locked} className="grid gap-3 md:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">{frontendText(locale, "PROJECT_TIMELINE_EDIT")}</legend>
      <label className="space-y-1 text-sm"><span>{frontendText(locale, "PROJECT_TIMELINE_EDIT_KIND")}</span><select className="h-10 w-full rounded-md border bg-background px-3" aria-label={frontendText(locale, "PROJECT_TIMELINE_EDIT_KIND")} value={kind} onChange={event => edit("kind", event.currentTarget.value as ProjectTimelineItem["kind"])}>
        {(["meeting", "decision", "action_item", "milestone"] as const).map(value => <option key={value} value={value}>{frontendText(locale, `PROJECT_TIMELINE_KIND_${value.toUpperCase()}`)}</option>)}
      </select></label>
      <label className="space-y-1 text-sm"><span>{frontendText(locale, "PROJECT_TIMELINE_EDIT_TITLE")}</span><Input ref={titleInput} maxLength={200} aria-label={frontendText(locale, "PROJECT_TIMELINE_EDIT_TITLE")} value={title} onChange={event => edit("title", event.currentTarget.value)} /></label>
      <label className="space-y-1 text-sm md:col-span-2"><span>{frontendText(locale, "PROJECT_TIMELINE_EDIT_BODY")}</span><Textarea rows={4} maxLength={200000} aria-label={frontendText(locale, "PROJECT_TIMELINE_EDIT_BODY")} value={body} onChange={event => edit("body", event.currentTarget.value)} /></label>
      <label className="space-y-1 text-sm"><span>{frontendText(locale, "PROJECT_TIMELINE_EDIT_START")}</span><Input type="datetime-local" step="0.001" aria-label={frontendText(locale, "PROJECT_TIMELINE_EDIT_START")} value={startsAt} onChange={event => edit("startsAt", event.currentTarget.value)} /></label>
      <label className="space-y-1 text-sm"><span>{frontendText(locale, "PROJECT_TIMELINE_EDIT_DUE")}</span><Input type="datetime-local" step="0.001" aria-label={frontendText(locale, "PROJECT_TIMELINE_EDIT_DUE")} value={dueAt} onChange={event => edit("dueAt", event.currentTarget.value)} /></label>
    </fieldset>
    {saveFailed && <p role="alert">{frontendText(locale, "PROJECT_TIMELINE_ACTION_FAILED")}</p>}
    {stale && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "PROJECT_TIMELINE_EDIT_STALE")}</p>}
    {invalid && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "PROJECT_TIMELINE_EDIT_INVALID")}</p>}
    <div className="flex gap-2"><Button type="button" size="sm" disabled={locked || invalid || stale} onClick={() => void save()}>{frontendText(locale, "PROJECT_TIMELINE_EDIT_SAVE")}</Button><Button type="button" size="sm" variant="outline" disabled={locked} onClick={requestClose}>{frontendText(locale, "PROJECT_TIMELINE_EDIT_CANCEL")}</Button></div>
    <ConfirmAction open={decision !== null} title={frontendText(locale, "CREATE_DISCARD_TITLE")}
      description={frontendText(locale, decision?.navigation ? "CREATE_DISCARD_IMPACT" : "TIMELINE_EDIT_DISCARD_IMPACT")}
      cancelLabel={frontendText(locale, "TASKS_KEEP_EDITING")} confirmLabel={frontendText(locale, "TASKS_DISCARD_CONFIRM")}
      onCancel={cancelDecision} onConfirm={confirmDecision} />
  </div>;
}
