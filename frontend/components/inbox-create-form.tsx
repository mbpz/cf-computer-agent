import { useEffect, useRef, useState } from "react";
import { ApiRequestError } from "../lib/api";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

import { loadInboxIntent, saveInboxIntent, acknowledgeInboxIntent, clearInboxIntent, validInboxIntent, type StoredInboxIntent, type InboxCreateIntent } from "../lib/inbox-create-intent";
export interface InboxCreateCallbacks {
  createMemberId?: string;
  onCreate?: (input: InboxCreateIntent) => Promise<unknown>;
  onCreateReadback?: (intent: InboxCreateIntent) => Promise<boolean>;
  onCreateDenied?: (error: unknown) => void;
  onCreateLock?: (locked: boolean) => void;
}
type Phase = "editing" | "writing" | "unknown" | "reading" | "read-failed" | "storage-blocked";

// Persist before POST; restored intents require explicit retry, never a new key.
export function InboxCreateForm({ locale, createMemberId, pending = false, onCreate, onCreateReadback, onCreateDenied, onCreateLock }: InboxCreateCallbacks & {
  locale: LocaleRuntime; pending?: boolean;
}) {
  const [stored] = useState<StoredInboxIntent>(() => createMemberId ? loadInboxIntent(createMemberId) : { kind: "blocked" });
  const initialPhase: Phase = stored.kind === "blocked" ? "storage-blocked" : stored.kind === "ready" ? stored.acknowledged ? "read-failed" : "unknown" : "editing";
  const [kind, setKind] = useState<"text" | "link">(stored.kind === "ready" ? stored.intent.kind : "text");
  const [content, setContent] = useState(stored.kind === "ready" ? stored.intent.content : "");
  const [sourceUrl, setSourceUrl] = useState(stored.kind === "ready" ? stored.intent.sourceUrl ?? "" : "");
  const acknowledged = useRef(stored.kind === "ready" && stored.acknowledged);
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [error, setError] = useState(false);
  const intentRef = useRef<InboxCreateIntent | null>(stored.kind === "ready" ? stored.intent : null);
  const phaseRef = useRef<Phase>(initialPhase);
  const generation = useRef(0);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    onCreateLock?.(initialPhase !== "editing");
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
  const clearStored = () => !createMemberId || !intentRef.current || clearInboxIntent(createMemberId, intentRef.current);
  const reloadStored = () => {
    if (!createMemberId || phaseRef.current !== "storage-blocked") return;
    const previous = intentRef.current;
    // A storage check must never replace the in-memory unresolved intent.
    if (previous && !(acknowledged.current ? acknowledgeInboxIntent(createMemberId, previous) : saveInboxIntent(createMemberId, previous))) return;
    const restored = loadInboxIntent(createMemberId);
    if (restored.kind === "blocked") return;
    intentRef.current = restored.kind === "ready" ? restored.intent : null;
    acknowledged.current = restored.kind === "ready" && restored.acknowledged;
    if (restored.kind === "ready") { setKind(restored.intent.kind); setContent(restored.intent.content); setSourceUrl(restored.intent.sourceUrl ?? ""); }
    transition(restored.kind === "ready" ? restored.acknowledged ? "read-failed" : "unknown" : "editing");
  };
  const denied = (cause: unknown) => {
    if (!(cause instanceof ApiRequestError) || (cause.status !== 401 && cause.status !== 403)) return false;
    clearStored(); intentRef.current = null; acknowledged.current = false; setContent(""); setSourceUrl(""); onCreateDenied?.(cause); return true;
  };
  const readback = async () => {
    const current = generation.current;
    transition("reading");
    try {
      const confirmed = intentRef.current ? await onCreateReadback?.(intentRef.current) : false;
      if (!active.current || generation.current !== current) return;
      if (!confirmed) { transition("read-failed"); return; }
      if (!clearStored()) { transition("storage-blocked"); return; }
      intentRef.current = null; acknowledged.current = false; setContent(""); setSourceUrl(""); setError(false); transition("editing");
    } catch (cause) {
      if (!active.current || generation.current !== current || denied(cause)) return;
      transition("read-failed");
    }
  };
  const submit = async () => {
    if (pending || !onCreate || (phaseRef.current !== "editing" && phaseRef.current !== "unknown")) return;
    const retry = phaseRef.current === "unknown";
    if (!retry) {
      const candidate: InboxCreateIntent = { id: crypto.randomUUID(), clientKey: crypto.randomUUID(), kind, content: content.trim(), sourceUrl: kind === "link" ? sourceUrl.trim() : null };
      if (!validInboxIntent(candidate)) { setError(true); return; }
      intentRef.current = Object.freeze(candidate);
    }
    const intent = intentRef.current;
    if (!intent) return;
    if (createMemberId && !saveInboxIntent(createMemberId, intent)) { transition("storage-blocked"); return; }
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
      if (createMemberId && !acknowledgeInboxIntent(createMemberId, intent)) { transition("storage-blocked"); return; }
      await readback();
    }
  };
  const locked = pending || phase !== "editing";
  return <div className="space-y-3" aria-busy={phase === "writing" || phase === "reading"}>
    <div className="flex flex-wrap gap-2"><select aria-label={frontendText(locale, "INBOX_KIND")} className="h-10 rounded-md border bg-background px-3 text-sm" value={kind} disabled={locked} onChange={event => setKind(event.currentTarget.value as "text" | "link")}><option value="text">{frontendText(locale, "INBOX_KIND_TEXT")}</option><option value="link">{frontendText(locale, "INBOX_KIND_LINK")}</option></select>{kind === "link" && <Input aria-label={frontendText(locale, "INBOX_SOURCE_URL")} value={sourceUrl} disabled={locked} onChange={event => setSourceUrl(event.currentTarget.value)} placeholder={frontendText(locale, "INBOX_SOURCE_URL")} />}</div>
    <Textarea aria-label={frontendText(locale, "INBOX_CONTENT")} value={content} disabled={locked} onChange={event => setContent(event.currentTarget.value)} placeholder={frontendText(locale, "INBOX_CONTENT_PLACEHOLDER")} rows={4} />
    {phase === "storage-blocked" ? <><p role="alert">{frontendText(locale, "INBOX_CREATE_STORAGE_BLOCKED")}</p><Button type="button" data-create-storage-retry disabled={pending} onClick={reloadStored}>{frontendText(locale, "INBOX_CREATE_STORAGE_RETRY")}</Button></>
      : phase === "unknown" ? <><p role="alert" className="text-sm text-destructive">{frontendText(locale, "INBOX_CREATE_UNKNOWN")}</p><Button type="button" data-create-retry disabled={pending} onClick={() => void submit()}>{frontendText(locale, "INBOX_CREATE_RETRY")}</Button></>
      : phase === "read-failed" ? <><p role="alert" className="text-sm text-destructive">{frontendText(locale, "INBOX_CREATE_READ_FAILED")}</p><Button type="button" data-create-read-retry disabled={pending} onClick={() => { if (phaseRef.current === "read-failed") void readback(); }}>{frontendText(locale, "INBOX_CREATE_READ_RETRY")}</Button></>
      : <Button type="button" disabled={locked || !content.trim() || !onCreate} onClick={() => void submit()}>{frontendText(locale, "INBOX_CAPTURE")}</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{frontendText(locale, "INBOX_ACTION_FAILED")}</p>}
  </div>;
}
