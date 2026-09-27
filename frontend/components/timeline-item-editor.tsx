import { useEffect, useRef, useState } from "react";
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
  const [original, setOriginal] = useState<ProjectTimelineItem | null>(null);
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const [kind, setKind] = useState(item.kind);
  const [startsAt, setStartsAt] = useState(""); const [dueAt, setDueAt] = useState("");
  const submitting = useRef(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (original) titleInput.current?.focus();
    else if (wasEditing.current) editButton.current?.focus();
    wasEditing.current = original !== null;
  }, [original]);
  if (!original) return <Button ref={editButton} type="button" size="sm" variant="outline" disabled={pending} onClick={() => {
    setOriginal(item); setTitle(item.title); setBody(item.body); setKind(item.kind); setStartsAt(localTime(item.startsAt)); setDueAt(localTime(item.dueAt));
  }}>{frontendText(locale, "PROJECT_TIMELINE_EDIT")}</Button>;
  // Preserve untouched instants exactly (including ambiguous DST local times).
  const start = startsAt === localTime(original.startsAt) ? original.startsAt : isoTime(startsAt);
  const due = dueAt === localTime(original.dueAt) ? original.dueAt : isoTime(dueAt);
  const invalid = !title.trim() || title.trim().length > 200 || body.length > 200_000 || start === undefined || due === undefined || !!(start && due && Date.parse(due) < Date.parse(start));
  const stale = original.updatedAt !== item.updatedAt;
  async function save() {
    if (pending || submitting.current || invalid || stale || !original || start === undefined || due === undefined) return;
    submitting.current = true;
    try { if (await onSave(original, { kind, title: title.trim(), body, startsAt: start, dueAt: due })) setOriginal(null); }
    finally { submitting.current = false; }
  }
  return <div className="space-y-3 rounded-md border p-3">
    <fieldset disabled={pending} className="grid gap-3 md:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">{frontendText(locale, "PROJECT_TIMELINE_EDIT")}</legend>
      <label className="space-y-1 text-sm"><span>{frontendText(locale, "PROJECT_TIMELINE_EDIT_KIND")}</span><select className="h-10 w-full rounded-md border bg-background px-3" aria-label={frontendText(locale, "PROJECT_TIMELINE_EDIT_KIND")} value={kind} onChange={event => setKind(event.currentTarget.value as ProjectTimelineItem["kind"])}>
        {(["meeting", "decision", "action_item", "milestone"] as const).map(value => <option key={value} value={value}>{frontendText(locale, `PROJECT_TIMELINE_KIND_${value.toUpperCase()}`)}</option>)}
      </select></label>
      <label className="space-y-1 text-sm"><span>{frontendText(locale, "PROJECT_TIMELINE_EDIT_TITLE")}</span><Input ref={titleInput} maxLength={200} aria-label={frontendText(locale, "PROJECT_TIMELINE_EDIT_TITLE")} value={title} onChange={event => setTitle(event.currentTarget.value)} /></label>
      <label className="space-y-1 text-sm md:col-span-2"><span>{frontendText(locale, "PROJECT_TIMELINE_EDIT_BODY")}</span><Textarea rows={4} maxLength={200000} aria-label={frontendText(locale, "PROJECT_TIMELINE_EDIT_BODY")} value={body} onChange={event => setBody(event.currentTarget.value)} /></label>
      <label className="space-y-1 text-sm"><span>{frontendText(locale, "PROJECT_TIMELINE_EDIT_START")}</span><Input type="datetime-local" step="0.001" aria-label={frontendText(locale, "PROJECT_TIMELINE_EDIT_START")} value={startsAt} onChange={event => setStartsAt(event.currentTarget.value)} /></label>
      <label className="space-y-1 text-sm"><span>{frontendText(locale, "PROJECT_TIMELINE_EDIT_DUE")}</span><Input type="datetime-local" step="0.001" aria-label={frontendText(locale, "PROJECT_TIMELINE_EDIT_DUE")} value={dueAt} onChange={event => setDueAt(event.currentTarget.value)} /></label>
    </fieldset>
    {stale && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "PROJECT_TIMELINE_EDIT_STALE")}</p>}
    {invalid && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "PROJECT_TIMELINE_EDIT_INVALID")}</p>}
    <div className="flex gap-2"><Button type="button" size="sm" disabled={pending || invalid || stale} onClick={() => void save()}>{frontendText(locale, "PROJECT_TIMELINE_EDIT_SAVE")}</Button><Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setOriginal(null)}>{frontendText(locale, "PROJECT_TIMELINE_EDIT_CANCEL")}</Button></div>
  </div>;
}
