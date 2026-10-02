import { useEffect, useRef, useState } from "react";
import { ApiRequestError } from "./api";
import type { LocaleRuntime } from "./i18n";
import { clearPrivateKnowledgeNote, loadPrivateKnowledgeNote, loadRemotePrivateKnowledgeNote, memberKnowledgeNoteStorage, savePrivateKnowledgeNote, saveRemotePrivateKnowledgeNote, type PrivateKnowledgeNoteCitation, type RemotePrivateKnowledgeNote } from "./knowledge-note";
import { useCreateDraft } from "./use-create-draft";

type Fields = { title: string; body: string };
type Intent = { fields: Fields; citations: PrivateKnowledgeNoteCitation[] };
type Phase = "loading" | "idle" | "saving" | "unknown" | "load-error";
const blank = { title: "", body: "" };

/** Mounted under a member/item key. No ambiguous PUT is replayed automatically. */
export function useReaderNote(memberId: string, knowledgeItemId: string, locale?: LocaleRuntime, actionBlocked: () => boolean = () => false) {
  const owner = useRef<AbortController | null>(null);
  const intent = useRef<Intent | null>(null);
  const [persisted, setPersisted] = useState<RemotePrivateKnowledgeNote | null>(null);
  const persistedRef = useRef(persisted);
  function remember(note: RemotePrivateKnowledgeNote | null) { persistedRef.current = note; setPersisted(note); }
  const cachedDraft = useRef(false);
  const [discardError, setDiscardError] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const phaseRef = useRef<Phase>("loading");
  const [access, setAccess] = useState<"owner" | "shared">("owner");
  const accessRef = useRef<"owner" | "shared">("owner");
  const [status, setStatus] = useState<"idle" | "saved" | "saving" | "unsaved" | "error">("idle");
  const draft = useCreateDraft(blank, blank, () => intent.current !== null || actionBlocked(), locale,
    () => !owner.current || phaseRef.current !== "idle" || accessRef.current !== "owner" || actionBlocked(), discardCache);
  function transition(next: Phase) { phaseRef.current = next; setPhase(next); }
  useEffect(() => {
    if (!memberId || !knowledgeItemId) { transition("load-error"); return; }
    const controller = new AbortController(); owner.current = controller;
    void load(controller);
    return () => { controller.abort(); owner.current = null; intent.current = null; };
  }, []);
  function discardCache() {
    if (!owner.current || intent.current || actionBlocked()) return false;
    if (!cachedDraft.current) return true;
    try {
      clearPrivateKnowledgeNote(knowledgeItemId, memberKnowledgeNoteStorage(memberId));
      cachedDraft.current = false; setDiscardError(false); return true;
    } catch { setDiscardError(true); return false; }
  }
  async function load(controller: AbortController) {
    transition("loading");
    try {
      const note = await loadRemotePrivateKnowledgeNote(knowledgeItemId, fetch, controller.signal);
      if (owner.current !== controller) return;
      if (note?.access === "owner" && note.ownerId !== memberId) throw new Error("KNOWLEDGE_NOTE_OWNER_INVALID");
      remember(note);
      const permission = note?.access ?? "owner";
      accessRef.current = permission; setAccess(permission);
      const baseline = note ? { title: note.title, body: note.body } : blank;
      let restored = baseline;
      if (permission === "owner") {
        try {
          const cached = loadPrivateKnowledgeNote(knowledgeItemId, memberKnowledgeNoteStorage(memberId));
          if (cached.updatedAt) { cachedDraft.current = true; restored = { title: cached.title, body: cached.body }; }
        } catch { /* Cache is optional, never evidence of remote authorization. */ }
      }
      draft.set("title", restored.title); draft.set("body", restored.body); draft.checkpoint(baseline);
      setStatus(JSON.stringify(restored) === JSON.stringify(baseline) ? "idle" : "unsaved"); transition("idle");
    } catch {
      if (owner.current === controller) { transition("load-error"); setStatus("error"); }
    }
  }
  function retryLoad() { const controller = owner.current; if (controller && phaseRef.current === "load-error") void load(controller); }
  function edit(key: keyof Fields, value: string) {
    const before = draft.current.current;
    draft.edit(key, value);
    if (before !== draft.current.current) setStatus("unsaved");
  }
  async function save(citations: readonly PrivateKnowledgeNoteCitation[]) {
    const controller = owner.current;
    if (!controller || intent.current || phaseRef.current !== "idle" || accessRef.current !== "owner" || draft.isConfirming() || actionBlocked()) return;
    const fields = { title: draft.current.current.title.trim(), body: draft.current.current.body.trim() };
    if (!fields.title || !fields.body || !citations.length || new TextEncoder().encode(fields.title).length > 1024 || new TextEncoder().encode(fields.body).length > 32768) { setStatus("error"); return; }
    const operation = { fields, citations: citations.map(citation => ({ ...citation })) };
    intent.current = operation; transition("saving"); setStatus("saving");
    try {
      const result = await saveRemotePrivateKnowledgeNote(knowledgeItemId, fields, operation.citations, fetch, controller.signal);
      if (owner.current !== controller || intent.current !== operation) return;
      if (!matches(result, operation)) throw new Error("KNOWLEDGE_NOTE_RECEIPT_INVALID");
      accept(operation, result);
    } catch (error) {
      if (owner.current !== controller || intent.current !== operation) return;
      if (error instanceof ApiRequestError && error.status === 400 && error.code === "PRIVATE_NOTE_INVALID") {
        // Service validation precedes the upsert, so this exact response proves no write.
        try { savePrivateKnowledgeNote(knowledgeItemId, fields, memberKnowledgeNoteStorage(memberId)); cachedDraft.current = true; } catch { /* Visible draft remains. */ }
        intent.current = null; transition("idle"); setStatus("error");
      } else { transition("unknown"); setStatus("error"); }
    }
  }
  function matches(note: RemotePrivateKnowledgeNote | null, operation: Intent) {
    return !!note && note.ownerId === memberId && note.knowledgeItemId === knowledgeItemId && note.access === "owner"
      && note.title === operation.fields.title && note.body === operation.fields.body
      && JSON.stringify(note.citations) === JSON.stringify(operation.citations);
  }
  function accept(operation: Intent, result: RemotePrivateKnowledgeNote) {
    // A stale cached draft must not resurrect after a successful save. Keep the
    // intent locked if cleanup fails; a subsequent read may retry cleanup only.
    if (cachedDraft.current) { clearPrivateKnowledgeNote(knowledgeItemId, memberKnowledgeNoteStorage(memberId)); cachedDraft.current = false; }
    setDiscardError(false);
    remember(result);
    draft.set("title", operation.fields.title); draft.set("body", operation.fields.body); draft.checkpoint(operation.fields);
    intent.current = null; transition("idle"); setStatus("saved");
  }
  async function check() {
    const controller = owner.current; const operation = intent.current;
    if (!controller || !operation || phaseRef.current !== "unknown") return;
    transition("saving");
    try {
      const note = await loadRemotePrivateKnowledgeNote(knowledgeItemId, fetch, controller.signal);
      if (owner.current !== controller || intent.current !== operation) return;
      // This proves the desired current state, not that the original request committed.
      if (note && matches(note, operation)) { accept(operation, note); return; }
    } catch { /* Absence, failure and different content cannot disprove a pending write. */ }
    if (owner.current === controller && intent.current === operation) transition("unknown");
  }
  const isOwnLocked = () => !owner.current || phaseRef.current !== "idle" || accessRef.current !== "owner" || draft.isConfirming();
  return { draft, access, status, phase, discardError, edit, save, check, retryLoad, persisted, getPersisted: () => persistedRef.current, isOwnLocked,
    locked: phase !== "idle" || access !== "owner" || draft.confirming || actionBlocked(),
    isLocked: () => isOwnLocked() || actionBlocked() };
}
