import { Plus } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { ApiRequestError } from "../lib/api";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { TimelineCreateIntent, ProjectTimelineKind } from "../lib/projects-data";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
export interface TimelineCreateCallbacks {
  onCreate?: (input: TimelineCreateIntent) => Promise<unknown>;
  onCreateReadback?: () => Promise<boolean>;
  onCreateDenied?: (error: unknown) => void;
  onCreateLock?: (locked: boolean) => void;
}
type Phase = "editing" | "writing" | "unknown" | "reading" | "read-failed";
// The keyed route owns this form; an unresolved intent never silently becomes a new request.
export function TimelineCreateForm({ locale, pending = false, onCreate, onCreateReadback, onCreateDenied, onCreateLock }: TimelineCreateCallbacks & { locale: LocaleRuntime; pending?: boolean }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<ProjectTimelineKind>("meeting");
  const [startsAt, setStartsAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [phase, setPhase] = useState<Phase>("editing");
  const [error, setError] = useState(false);
  const intentRef = useRef<TimelineCreateIntent | null>(null);
  const phaseRef = useRef<Phase>("editing");
  const generation = useRef(0);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; generation.current++; };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (phaseRef.current !== "editing") { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const transition = (next: Phase) => { phaseRef.current = next; setPhase(next); onCreateLock?.(next !== "editing"); };
  const denied = (cause: unknown) => {
    if (!(cause instanceof ApiRequestError) || ![401, 403, 404].includes(cause.status)) return false;
    intentRef.current = null; setTitle(""); setBody(""); setStartsAt(""); setDueAt(""); onCreateDenied?.(cause); return true;
  };
  const readback = async () => {
    const current = generation.current;
    transition("reading");
    try {
      const confirmed = await onCreateReadback?.();
      if (!active.current || generation.current !== current) return;
      if (!confirmed) { transition("read-failed"); return; }
      intentRef.current = null; setTitle(""); setBody(""); setStartsAt(""); setDueAt(""); setError(false); transition("editing");
    } catch (cause) {
      if (!active.current || generation.current !== current || denied(cause)) return;
      transition("read-failed");
    }
  };
  const submit = async () => {
    if (pending || !onCreate || (phaseRef.current !== "editing" && phaseRef.current !== "unknown")) return;
    const retry = phaseRef.current === "unknown";
    if (!retry) {
      const start = startsAt ? Date.parse(startsAt) : null;
      const due = dueAt ? Date.parse(dueAt) : null;
      if (!title.trim() || title.trim().length > 200 || body.trim().length > 200_000
        || (start !== null && !Number.isFinite(start)) || (due !== null && !Number.isFinite(due))
        || (start !== null && due !== null && due < start)) { setError(true); return; }
      intentRef.current = Object.freeze({ id: crypto.randomUUID(), clientKey: crypto.randomUUID(), kind, title: title.trim(), body: body.trim(), startsAt: start === null ? null : new Date(start).toISOString(), dueAt: due === null ? null : new Date(due).toISOString() });
    }
    const intent = intentRef.current;
    if (!intent) return;
    const current = generation.current;
    transition("writing"); setError(false);
    try {
      await onCreate(intent);
    } catch (cause) {
      if (!active.current || generation.current !== current || denied(cause)) return;
      const knownRejection = !retry && cause instanceof ApiRequestError && !cause.retryable && cause.status >= 400 && cause.status < 500 && cause.status !== 408;
      if (knownRejection) { intentRef.current = null; setError(true); transition("editing"); }
      else transition("unknown");
      return;
    }
    if (active.current && generation.current === current) await readback();
  };
  const locked = pending || phase !== "editing";
  const recovery = <div aria-busy={phase === "writing" || phase === "reading"}>
    {phase === "unknown" && <><p role="alert">{frontendText(locale, "PLANNING_CREATE_UNKNOWN")}</p><Button type="button" disabled={pending} onClick={() => void submit()}>{frontendText(locale, "PLANNING_CREATE_RETRY")}</Button></>}
    {phase === "read-failed" && <><p role="alert">{frontendText(locale, "PLANNING_CREATE_READ_FAILED")}</p><Button type="button" disabled={pending} onClick={() => { if (phaseRef.current === "read-failed") void readback(); }}>{frontendText(locale, "PLANNING_CREATE_READ_RETRY")}</Button></>}
    {error && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "PROJECT_TIMELINE_ACTION_FAILED")}</p>}
  </div>;
  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base"><Plus size={18} />{frontendText(locale, "PROJECT_TIMELINE_CREATE_TITLE")}</CardTitle>
    </CardHeader>
    <CardContent>
      <fieldset disabled={locked} className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>{frontendText(locale, "PROJECT_TIMELINE_KIND")}</span>
          <select disabled={locked} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={kind} onChange={(event) => setKind(event.currentTarget.value as ProjectTimelineKind)}>
            <option value="meeting">{frontendText(locale, "PROJECT_TIMELINE_KIND_MEETING")}</option>
            <option value="decision">{frontendText(locale, "PROJECT_TIMELINE_KIND_DECISION")}</option>
            <option value="action_item">{frontendText(locale, "PROJECT_TIMELINE_KIND_ACTION")}</option>
            <option value="milestone">{frontendText(locale, "PROJECT_TIMELINE_KIND_MILESTONE")}</option>
          </select>
        </label>
        <Input disabled={locked} aria-label={frontendText(locale, "PROJECT_TIMELINE_TITLE_FIELD")} value={title} onChange={(event) => setTitle(event.currentTarget.value)} placeholder={frontendText(locale, "PROJECT_TIMELINE_TITLE_PLACEHOLDER")} />
        <Textarea disabled={locked} className="md:col-span-2" aria-label={frontendText(locale, "PROJECT_TIMELINE_BODY_FIELD")} value={body} onChange={(event) => setBody(event.currentTarget.value)} placeholder={frontendText(locale, "PROJECT_TIMELINE_BODY_PLACEHOLDER")} rows={3} />
        <label className="space-y-1 text-sm">
          <span>{frontendText(locale, "PROJECT_TIMELINE_STARTS_AT")}</span>
          <Input disabled={locked} type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.currentTarget.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span>{frontendText(locale, "PROJECT_TIMELINE_DUE_AT")}</span>
          <Input disabled={locked} type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.currentTarget.value)} />
        </label>
        <div className="md:col-span-2"><Button type="button" onClick={() => void submit()} disabled={locked || !title.trim() || !onCreate}>{frontendText(locale, "PROJECT_TIMELINE_CREATE")}</Button></div>
      </fieldset>
      {recovery}
    </CardContent>
  </Card>;
}
