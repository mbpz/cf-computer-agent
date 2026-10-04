import { useCreateDraft } from "../lib/use-create-draft";
import { useEffect, useRef, useState } from "react";
import { ApiRequestError } from "../lib/api";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { localCalendarInstant, localCalendarTime } from "../lib/calendar-query";

import { loadCalendarIntent, saveCalendarIntent, acknowledgeCalendarIntent, clearCalendarIntent, validCalendarIntent, type StoredCalendarIntent, type CalendarCreateIntent } from "../lib/calendar-create-intent";
import { discardBlockedCalendarDraft, loadCalendarDraft, persistCalendarDraft } from "../lib/calendar-draft";
import { WORKSPACE_LOCATION_CHANGE_EVENT } from "../lib/workspace-location";
export interface CalendarCreateCallbacks {
  createMemberId?: string;
  onCreate?: (input: CalendarCreateIntent) => Promise<unknown>;
  onCreateReadback?: (intent: CalendarCreateIntent) => Promise<boolean>;
  onCreateDenied?: (error: unknown) => void;
  onCreateLock?: (locked: boolean) => void;
}
type Phase = "editing" | "writing" | "unknown" | "reading" | "read-failed" | "storage-blocked";

// Persist before POST; restored intents require explicit retry, never a new key.
export function CalendarCreateForm({ locale, createMemberId, pending = false, isSubmitBlocked, onCreate, onCreateReadback, onCreateDenied, onCreateLock }: CalendarCreateCallbacks & {
  locale: LocaleRuntime; pending?: boolean; isSubmitBlocked?: () => boolean;
}) {
  const [stored] = useState<StoredCalendarIntent>(() => createMemberId ? loadCalendarIntent(createMemberId) : { kind: "blocked" });
  const [composer] = useState(() => createMemberId && stored.kind === "empty" ? loadCalendarDraft(createMemberId) : { kind: "empty" as const });
  const [recordBlocked, setRecordBlocked] = useState(composer.kind === "blocked");
  const [recordNotice, setRecordNotice] = useState<string>();
  const initialPhase: Phase = stored.kind === "blocked" ? "storage-blocked" : stored.kind === "ready" ? stored.acknowledged ? "read-failed" : "unknown" : "editing";
  const acknowledged = useRef(stored.kind === "ready" && stored.acknowledged);
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [error, setError] = useState(false);
  const intentRef = useRef<CalendarCreateIntent | null>(stored.kind === "ready" ? stored.intent : null);
  const phaseRef = useRef<Phase>(initialPhase);
  const blank = { title: "", startsAt: "", endsAt: "" };
  const fromIntent = stored.kind === "ready" ? { title: stored.intent.title, startsAt: localCalendarTime(stored.intent.startsAt), endsAt: localCalendarTime(stored.intent.endsAt) } : blank;
  const draft = useCreateDraft<{ title: string; startsAt: string; endsAt: string }>(
    composer.kind === "ready" ? composer.draft : fromIntent,
    blank,
    () => phaseRef.current !== "editing", locale, () => pending || !!isSubmitBlocked?.());
  useEffect(() => {
    if (!createMemberId || recordBlocked || phase !== "editing") return;
    const saved = persistCalendarDraft(createMemberId, draft.fields);
    setRecordNotice(saved ? undefined : frontendText(locale, "CALENDAR_DRAFT_NOT_RECORDED"));
  }, [draft.fields.title, draft.fields.startsAt, draft.fields.endsAt, phase, recordBlocked, createMemberId, locale]);
  useEffect(() => {
    const clearOnLeave = () => { if (createMemberId && !recordBlocked && phaseRef.current === "editing") persistCalendarDraft(createMemberId, blank); };
    window.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave);
    return () => window.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave);
  }, [createMemberId, recordBlocked]);
  const { title, startsAt, endsAt } = draft.fields;
  const setTitle = (value: string) => draft.set("title", value);
  const setStartsAt = (value: string) => draft.set("startsAt", value);
  const setEndsAt = (value: string) => draft.set("endsAt", value);

  const generation = useRef(0);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    onCreateLock?.(initialPhase !== "editing");
    return () => { active.current = false; generation.current++; };
  }, []);
  const transition = (next: Phase) => { phaseRef.current = next; setPhase(next); onCreateLock?.(next !== "editing"); };
  const clearStored = () => !createMemberId || !intentRef.current || clearCalendarIntent(createMemberId, intentRef.current);
  const reloadStored = () => {
    if (!createMemberId || phaseRef.current !== "storage-blocked") return;
    const previous = intentRef.current;
    // A storage check must never replace the in-memory unresolved intent.
    if (previous && !(acknowledged.current ? acknowledgeCalendarIntent(createMemberId, previous) : saveCalendarIntent(createMemberId, previous))) return;
    const restored = loadCalendarIntent(createMemberId);
    if (restored.kind === "blocked") return;
    intentRef.current = restored.kind === "ready" ? restored.intent : null;
    acknowledged.current = restored.kind === "ready" && restored.acknowledged;
    if (restored.kind === "ready") { setTitle(restored.intent.title); setStartsAt(localCalendarTime(restored.intent.startsAt)); setEndsAt(localCalendarTime(restored.intent.endsAt)); }
    transition(restored.kind === "ready" ? restored.acknowledged ? "read-failed" : "unknown" : "editing");
  };
  const denied = (cause: unknown) => {
    if (!(cause instanceof ApiRequestError) || (cause.status !== 401 && cause.status !== 403)) return false;
    clearStored(); intentRef.current = null; acknowledged.current = false; setTitle(""); setStartsAt(""); setEndsAt(""); onCreateDenied?.(cause); return true;
  };
  const readback = async () => {
    const current = generation.current;
    transition("reading");
    try {
      const confirmed = intentRef.current ? await onCreateReadback?.(intentRef.current) : false;
      if (!active.current || generation.current !== current) return;
      if (!confirmed) { transition("read-failed"); return; }
      if (!clearStored()) { transition("storage-blocked"); return; }
      intentRef.current = null; acknowledged.current = false; draft.reset(); setError(false); transition("editing");
    } catch (cause) {
      if (!active.current || generation.current !== current || denied(cause)) return;
      transition("read-failed");
    }
  };
  const submit = async () => {
    if (draft.isConfirming() || pending || isSubmitBlocked?.() || !onCreate || (phaseRef.current !== "editing" && phaseRef.current !== "unknown")) return;
    const retry = phaseRef.current === "unknown";
    if (!retry) {
      const { title, startsAt, endsAt } = draft.current.current;
      const candidate: CalendarCreateIntent = { id: crypto.randomUUID(), clientKey: crypto.randomUUID(), title: title.trim(), startsAt: localCalendarInstant(startsAt) ?? "", endsAt: localCalendarInstant(endsAt) ?? "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" };
      if (!validCalendarIntent(candidate)) { setError(true); return; }
      intentRef.current = Object.freeze(candidate);
    }
    const intent = intentRef.current;
    if (!intent) return;
    if (createMemberId && !saveCalendarIntent(createMemberId, intent)) { transition("storage-blocked"); return; }
    if (createMemberId) persistCalendarDraft(createMemberId, blank);
    const current = generation.current;
    transition("writing"); setError(false);
    try {
      await onCreate(intent);
    } catch (cause) {
      if (!active.current || generation.current !== current || denied(cause)) return;
      const knownRejection = !retry && cause instanceof ApiRequestError && !cause.retryable && [400, 413, 422].includes(cause.status);
      if (knownRejection) { if (!clearStored()) { transition("storage-blocked"); return; } intentRef.current = null; setError(true); transition("editing"); }
      else transition("unknown");
      return;
    }
    if (active.current && generation.current === current) {
      acknowledged.current = true;
      if (createMemberId && !acknowledgeCalendarIntent(createMemberId, intent)) { transition("storage-blocked"); return; }
      await readback();
    }
  };
  const locked = draft.confirming || pending || phase !== "editing";
  const discardRecord = () => { if (!createMemberId || !recordBlocked || !discardBlockedCalendarDraft(createMemberId)) return; setRecordBlocked(false); setRecordNotice(undefined); };
  return <div className="space-y-3" aria-busy={phase === "writing" || phase === "reading"}>
    {recordBlocked && <div role="alert" data-calendar-draft-blocked className="space-y-2 text-sm"><p>{frontendText(locale, "CALENDAR_DRAFT_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={discardRecord}>{frontendText(locale, "CALENDAR_DRAFT_RECORD_DISCARD")}</Button></div>}
    {recordNotice && <p role="alert">{recordNotice}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <Input aria-label={frontendText(locale, "CALENDAR_TITLE_FIELD")} value={title} disabled={locked} maxLength={240} onChange={e => draft.edit("title", e.currentTarget.value)} placeholder={frontendText(locale, "CALENDAR_TITLE_PLACEHOLDER")} />
      <Input aria-label={frontendText(locale, "CALENDAR_START_FIELD")} type="datetime-local" value={startsAt} disabled={locked} onChange={e => draft.edit("startsAt", e.currentTarget.value)} />
      <Input aria-label={frontendText(locale, "CALENDAR_END_FIELD")} type="datetime-local" value={endsAt} disabled={locked} onChange={e => draft.edit("endsAt", e.currentTarget.value)} />
    </div>
    {phase === "storage-blocked" ? <><p role="alert">{frontendText(locale, "CALENDAR_CREATE_STORAGE_BLOCKED")}</p><Button type="button" data-create-storage-retry disabled={pending} onClick={reloadStored}>{frontendText(locale, "CALENDAR_CREATE_STORAGE_RETRY")}</Button></>
      : phase === "unknown" ? <><p role="alert" className="text-sm text-destructive">{frontendText(locale, "CALENDAR_CREATE_UNKNOWN")}</p><Button type="button" data-create-retry disabled={pending} onClick={() => void submit()}>{frontendText(locale, "CALENDAR_CREATE_RETRY")}</Button></>
      : phase === "read-failed" ? <><p role="alert" className="text-sm text-destructive">{frontendText(locale, "CALENDAR_CREATE_READ_FAILED")}</p><Button type="button" data-create-read-retry disabled={pending} onClick={() => { if (phaseRef.current === "read-failed") void readback(); }}>{frontendText(locale, "CALENDAR_CREATE_READ_RETRY")}</Button></>
      : <Button type="button" disabled={locked || !title.trim() || !startsAt || !endsAt || !onCreate} onClick={() => void submit()}>{frontendText(locale, "CALENDAR_CREATE")}</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "CALENDAR_ACTION_FAILED")}</p>}
    {draft.confirmation}
  </div>;
}
