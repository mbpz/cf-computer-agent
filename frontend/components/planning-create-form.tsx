import { useCreateDraft } from "../lib/use-create-draft";
import { useEffect, useRef, useState } from "react";
import { ApiRequestError } from "../lib/api";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

import { loadPlanningIntent, savePlanningIntent, acknowledgePlanningIntent, clearPlanningIntent, type StoredPlanningIntent, type PlanningCreateIntent } from "../lib/planning-create-intent";
import { discardBlockedPlanningDraft, loadPlanningDraft, persistPlanningDraft } from "../lib/planning-draft";
import { WORKSPACE_LOCATION_CHANGE_EVENT } from "../lib/workspace-location";
export interface PlanningCreateCallbacks {
  createMemberId?: string;
  onCreate?: (input: PlanningCreateIntent) => Promise<unknown>;
  onCreateReadback?: () => Promise<boolean>;
  onCreateDenied?: (error: unknown) => void;
  onCreateLock?: (locked: boolean) => void;
}
type Phase = "editing" | "writing" | "unknown" | "reading" | "read-failed" | "storage-blocked";

// Persist before POST; restored intents require explicit retry, never a new key.
export function PlanningCreateForm({ locale, kind, createMemberId, pending = false, isSubmitBlocked, onCreate, onCreateReadback, onCreateDenied, onCreateLock }: PlanningCreateCallbacks & {
  locale: LocaleRuntime; kind: "GOALS" | "PROJECTS"; pending?: boolean; isSubmitBlocked?: () => boolean;
}) {
  const [stored] = useState<StoredPlanningIntent>(() => createMemberId ? loadPlanningIntent(createMemberId, kind) : { kind: "empty" });
  const [composer] = useState(() => createMemberId && stored.kind === "empty" ? loadPlanningDraft(createMemberId, kind) : { kind: "empty" as const });
  const [recordBlocked, setRecordBlocked] = useState(composer.kind === "blocked");
  const [recordNotice, setRecordNotice] = useState<string>();
  const initialPhase: Phase = stored.kind === "blocked" ? "storage-blocked" : stored.kind === "ready" ? stored.acknowledged ? "read-failed" : "unknown" : "editing";
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [error, setError] = useState(false);
  const intentRef = useRef<PlanningCreateIntent | null>(stored.kind === "ready" ? stored.intent : null);
  const phaseRef = useRef<Phase>(initialPhase);
  const draft = useCreateDraft<{ title: string; description: string }>(
    composer.kind === "ready" ? composer.draft : { title: stored.kind === "ready" ? stored.intent.title : "", description: stored.kind === "ready" ? stored.intent.description ?? "" : "" },
    { title: "", description: "" },
    () => phaseRef.current !== "editing", locale, () => pending || !!isSubmitBlocked?.());
  useEffect(() => {
    if (!createMemberId || recordBlocked || phase !== "editing") return;
    const saved = persistPlanningDraft(createMemberId, kind, draft.fields);
    setRecordNotice(saved ? undefined : frontendText(locale, "PLANNING_DRAFT_NOT_RECORDED"));
  }, [draft.fields.title, draft.fields.description, phase, recordBlocked, createMemberId, kind, locale]);
  useEffect(() => {
    const clearOnLeave = () => { if (createMemberId && !recordBlocked && phaseRef.current === "editing") persistPlanningDraft(createMemberId, kind, { title: "", description: "" }); };
    window.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave);
    return () => window.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, clearOnLeave);
  }, [createMemberId, kind, recordBlocked]);
  const { title, description } = draft.fields;
  const setTitle = (value: string) => draft.set("title", value);
  const setDescription = (value: string) => draft.set("description", value);

  const generation = useRef(0);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    onCreateLock?.(initialPhase !== "editing");
    return () => { active.current = false; generation.current++; };
  }, []);
  const transition = (next: Phase) => { phaseRef.current = next; setPhase(next); onCreateLock?.(next !== "editing"); };
  const clearStored = () => !createMemberId || !intentRef.current || clearPlanningIntent(createMemberId, kind, intentRef.current);
  const reloadStored = () => {
    if (!createMemberId || phaseRef.current !== "storage-blocked") return;
    const restored = loadPlanningIntent(createMemberId, kind);
    if (restored.kind === "blocked") return;
    intentRef.current = restored.kind === "ready" ? restored.intent : null;
    if (restored.kind === "ready") { setTitle(restored.intent.title); setDescription(restored.intent.description ?? ""); }
    transition(restored.kind === "ready" ? restored.acknowledged ? "read-failed" : "unknown" : "editing");
  };
  const denied = (cause: unknown) => {
    if (!(cause instanceof ApiRequestError) || (cause.status !== 401 && cause.status !== 403)) return false;
    clearStored(); intentRef.current = null; setTitle(""); setDescription(""); onCreateDenied?.(cause); return true;
  };
  const readback = async () => {
    const current = generation.current;
    transition("reading");
    try {
      const confirmed = await onCreateReadback?.();
      if (!active.current || generation.current !== current) return;
      if (!confirmed) { transition("read-failed"); return; }
      if (!clearStored()) { transition("storage-blocked"); return; }
      intentRef.current = null; draft.reset(); setError(false); transition("editing");
    } catch (cause) {
      if (!active.current || generation.current !== current || denied(cause)) return;
      transition("read-failed");
    }
  };
  const submit = async () => {
    if (draft.isConfirming() || pending || isSubmitBlocked?.() || !onCreate || (phaseRef.current !== "editing" && phaseRef.current !== "unknown")) return;
    const retry = phaseRef.current === "unknown";
    if (!retry) {
      const { title, description } = draft.current.current;
      if (!title.trim() || [...title.trim()].length > 200 || [...description.trim()].length > 200_000) { setError(true); return; }
      intentRef.current = Object.freeze({ id: crypto.randomUUID(), clientKey: crypto.randomUUID(), title: title.trim(), description: description.trim() || null });
    }
    const intent = intentRef.current;
    if (!intent) return;
    if (createMemberId && !savePlanningIntent(createMemberId, kind, intent)) { transition("storage-blocked"); return; }
    if (createMemberId) persistPlanningDraft(createMemberId, kind, { title: "", description: "" });
    const current = generation.current;
    transition("writing"); setError(false);
    try {
      await onCreate(intent);
    } catch (cause) {
      if (!active.current || generation.current !== current || denied(cause)) return;
      const knownRejection = !retry && cause instanceof ApiRequestError && !cause.retryable && cause.status >= 400 && cause.status < 500 && cause.status !== 408;
      if (knownRejection) { if (!clearStored()) { transition("storage-blocked"); return; } intentRef.current = null; setError(true); transition("editing"); }
      else transition("unknown");
      return;
    }
    if (active.current && generation.current === current) {
      if (createMemberId && !acknowledgePlanningIntent(createMemberId, kind, intent)) { transition("storage-blocked"); return; }
      await readback();
    }
  };
  const locked = draft.confirming || pending || phase !== "editing";
  const discardRecord = () => { if (!createMemberId || !recordBlocked || !discardBlockedPlanningDraft(createMemberId, kind)) return; setRecordBlocked(false); setRecordNotice(undefined); };
  return <div className="space-y-3" aria-busy={phase === "writing" || phase === "reading"}>
    {recordBlocked && <div role="alert" data-planning-draft-blocked className="space-y-2 text-sm"><p>{frontendText(locale, "PLANNING_DRAFT_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={discardRecord}>{frontendText(locale, "PLANNING_DRAFT_RECORD_DISCARD")}</Button></div>}
    {recordNotice && <p role="alert">{recordNotice}</p>}
    <Input aria-label={frontendText(locale, `${kind}_TITLE_FIELD`)} value={title} disabled={locked} onChange={(event) => draft.edit("title", event.currentTarget.value)} placeholder={frontendText(locale, `${kind}_TITLE_PLACEHOLDER`)} />
    <Textarea aria-label={frontendText(locale, `${kind}_DESCRIPTION_FIELD`)} value={description} disabled={locked} onChange={(event) => draft.edit("description", event.currentTarget.value)} placeholder={frontendText(locale, `${kind}_DESCRIPTION_PLACEHOLDER`)} rows={3} />
    {phase === "storage-blocked" ? <><p role="alert">{frontendText(locale, "PLANNING_CREATE_STORAGE_BLOCKED")}</p><Button type="button" data-create-storage-retry disabled={pending} onClick={reloadStored}>{frontendText(locale, "PLANNING_CREATE_STORAGE_RETRY")}</Button></>
      : phase === "unknown" ? <><p role="alert" className="text-sm text-destructive">{frontendText(locale, "PLANNING_CREATE_UNKNOWN")}</p><Button type="button" data-create-retry disabled={pending} onClick={() => void submit()}>{frontendText(locale, "PLANNING_CREATE_RETRY")}</Button></>
      : phase === "read-failed" ? <><p role="alert" className="text-sm text-destructive">{frontendText(locale, "PLANNING_CREATE_READ_FAILED")}</p><Button type="button" data-create-read-retry disabled={pending} onClick={() => { if (phaseRef.current === "read-failed") void readback(); }}>{frontendText(locale, "PLANNING_CREATE_READ_RETRY")}</Button></>
      : <Button type="button" disabled={locked || !title.trim() || !onCreate} onClick={() => void submit()}>{frontendText(locale, `${kind}_CREATE`)}</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{frontendText(locale, `${kind}_ACTION_FAILED`)}</p>}
    {draft.confirmation}
  </div>;
}
