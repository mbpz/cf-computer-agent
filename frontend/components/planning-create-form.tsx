import { useEffect, useRef, useState } from "react";
import { ApiRequestError } from "../lib/api";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

import type { PlanningCreateIntent } from "../lib/planning-create-intent";
export interface PlanningCreateCallbacks {
  onCreate?: (input: PlanningCreateIntent) => Promise<unknown>;
  onCreateReadback?: () => Promise<boolean>;
  onCreateDenied?: (error: unknown) => void;
  onCreateLock?: (locked: boolean) => void;
}
type Phase = "editing" | "writing" | "unknown" | "reading" | "read-failed";

// One mounted form owns one unresolved intent. Never turn an uncertain write into a new key.
export function PlanningCreateForm({ locale, kind, pending = false, onCreate, onCreateReadback, onCreateDenied, onCreateLock }: PlanningCreateCallbacks & {
  locale: LocaleRuntime; kind: "GOALS" | "PROJECTS"; pending?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<Phase>("editing");
  const [error, setError] = useState(false);
  const intentRef = useRef<PlanningCreateIntent | null>(null);
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
    if (!(cause instanceof ApiRequestError) || (cause.status !== 401 && cause.status !== 403)) return false;
    intentRef.current = null; setTitle(""); setDescription(""); onCreateDenied?.(cause); return true;
  };
  const readback = async () => {
    const current = generation.current;
    transition("reading");
    try {
      const confirmed = await onCreateReadback?.();
      if (!active.current || generation.current !== current) return;
      if (!confirmed) { transition("read-failed"); return; }
      intentRef.current = null; setTitle(""); setDescription(""); setError(false); transition("editing");
    } catch (cause) {
      if (!active.current || generation.current !== current || denied(cause)) return;
      transition("read-failed");
    }
  };
  const submit = async () => {
    if (pending || !onCreate || (phaseRef.current !== "editing" && phaseRef.current !== "unknown")) return;
    const retry = phaseRef.current === "unknown";
    if (!retry) {
      if (!title.trim() || [...title.trim()].length > 200 || [...description.trim()].length > 200_000) { setError(true); return; }
      intentRef.current = Object.freeze({ id: crypto.randomUUID(), clientKey: crypto.randomUUID(), title: title.trim(), description: description.trim() || null });
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
  return <div className="space-y-3" aria-busy={phase === "writing" || phase === "reading"}>
    <Input aria-label={frontendText(locale, `${kind}_TITLE_FIELD`)} value={title} disabled={locked} onChange={(event) => setTitle(event.currentTarget.value)} placeholder={frontendText(locale, `${kind}_TITLE_PLACEHOLDER`)} />
    <Textarea aria-label={frontendText(locale, `${kind}_DESCRIPTION_FIELD`)} value={description} disabled={locked} onChange={(event) => setDescription(event.currentTarget.value)} placeholder={frontendText(locale, `${kind}_DESCRIPTION_PLACEHOLDER`)} rows={3} />
    {phase === "unknown" ? <><p role="alert" className="text-sm text-destructive">{frontendText(locale, "PLANNING_CREATE_UNKNOWN")}</p><Button type="button" data-create-retry disabled={pending} onClick={() => void submit()}>{frontendText(locale, "PLANNING_CREATE_RETRY")}</Button></>
      : phase === "read-failed" ? <><p role="alert" className="text-sm text-destructive">{frontendText(locale, "PLANNING_CREATE_READ_FAILED")}</p><Button type="button" data-create-read-retry disabled={pending} onClick={() => { if (phaseRef.current === "read-failed") void readback(); }}>{frontendText(locale, "PLANNING_CREATE_READ_RETRY")}</Button></>
      : <Button type="button" disabled={locked || !title.trim() || !onCreate} onClick={() => void submit()}>{frontendText(locale, `${kind}_CREATE`)}</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{frontendText(locale, `${kind}_ACTION_FAILED`)}</p>}
  </div>;
}
