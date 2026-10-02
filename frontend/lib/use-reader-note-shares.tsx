import { loadReaderNoteIntent, prepareReaderNoteIntent, finishReaderNoteIntent, type NoteShareIntent, type NoteFields } from "./reader-note-intent";
import { useEffect, useRef, useState } from "react";
import { ConfirmAction } from "../components/ui/confirm-action";
import { ApiRequestError } from "./api";
import { frontendText, type LocaleRuntime } from "./i18n";
import { listPrivateKnowledgeNoteShares, loadActiveWorkspaceMembers, loadRemotePrivateKnowledgeNote, revokePrivateKnowledgeNoteShare, sharePrivateKnowledgeNote, type PrivateKnowledgeNoteShare, type PrivateKnowledgeWorkspaceMember, type RemotePrivateKnowledgeNote } from "./knowledge-note";

type Operation = NoteShareIntent;
type Phase = "loading" | "idle" | "load-error" | "pending" | "unknown" | "storage-error";
type NoteOwner = { persisted: RemotePrivateKnowledgeNote | null; getPersisted: () => RemotePrivateKnowledgeNote | null; isOwnLocked: () => boolean; getFields: () => NoteFields };

/** Owned by the member/item-keyed reader; the note draft guard reads isBlocking synchronously. */
export function useReaderNoteShares(memberId: string, knowledgeItemId: string, note: NoteOwner, locale?: LocaleRuntime) {
  const [members, setMembers] = useState<PrivateKnowledgeWorkspaceMember[]>([]);
  const [shares, setShares] = useState<PrivateKnowledgeNoteShare[]>([]);
  const membersRef = useRef(members); const sharesRef = useRef(shares);
  const [recipient, setRecipient] = useState(""); const recipientRef = useRef("");
  const [phase, setPhase] = useState<Phase>("loading"); const phaseRef = useRef<Phase>("loading");
  const [error, setError] = useState(false);
  const [decision, setDecision] = useState<Operation | null>(null); const decisionRef = useRef<Operation | null>(null);
  const intent = useRef<Operation | null>(null);
  const owner = useRef<AbortController | null>(null);
  const outcome = useRef<"applied" | "rejected" | null>(null);
  const noteId = note.persisted?.access === "owner" && note.persisted.ownerId === memberId ? note.persisted.id : null;
  function transition(next: Phase) { phaseRef.current = next; setPhase(next); }
  function publish(rows: PrivateKnowledgeNoteShare[]) { sharesRef.current = rows.filter(row => row.revokedAt === null); setShares(sharesRef.current); }
  function validateRows(rows: PrivateKnowledgeNoteShare[], expected: string) {
    if (rows.some(row => row.noteId !== expected)) throw new Error("KNOWLEDGE_NOTE_SHARE_INVALID");
    return rows;
  }
  useEffect(() => {
    if (!noteId) return;
    const controller = new AbortController(); owner.current = controller;
    void load(controller, noteId);
    return () => { controller.abort(); owner.current = null; decisionRef.current = null; intent.current = null; };
  }, [noteId]);
  async function load(controller: AbortController, id: string) {
    transition("loading"); setError(false);
    try {
      const recovery = loadReaderNoteIntent(memberId, knowledgeItemId);
      if (recovery.kind === "blocked") { transition("storage-error"); setError(true); return; }
      if (recovery.kind === "ready" && recovery.intent.kind !== "save") {
        if (recovery.intent.noteId !== id) throw new Error("KNOWLEDGE_NOTE_OWNER_INVALID");
        intent.current = recovery.intent; outcome.current = recovery.outcome === "pending" ? null : recovery.outcome;
      }
      const [directory, rows] = await Promise.all([loadActiveWorkspaceMembers(fetch, controller.signal), listPrivateKnowledgeNoteShares(knowledgeItemId, fetch, controller.signal)]);
      if (owner.current !== controller) return;
      validateRows(rows, id);
      membersRef.current = directory.filter(member => member.id !== memberId); setMembers(membersRef.current); publish(rows); transition(intent.current ? "unknown" : "idle");
    } catch { if (owner.current === controller) { transition("load-error"); setError(true); } }
  }
  const isBlocking = () => intent.current !== null || decisionRef.current !== null || (!!noteId && (phaseRef.current === "storage-error" || (phaseRef.current === "loading" && loadReaderNoteIntent(memberId, knowledgeItemId).kind !== "empty")));
  const mayStart = () => !!owner.current && phaseRef.current === "idle" && !isBlocking() && !note.isOwnLocked();
  function select(value: string) {
    if (!mayStart() || (value && !membersRef.current.some(member => member.id === value))) return;
    recipientRef.current = value; setRecipient(value);
  }
  function request(kind: Operation["kind"], row?: PrivateKnowledgeNoteShare) {
    const current = note.getPersisted(); if (!mayStart() || !current || current.id !== noteId) return;
    const id = kind === "share" ? recipientRef.current : row?.recipientMemberId;
    if (!id || id === memberId) return;
    if (kind === "revoke" && (!row || !sharesRef.current.includes(row))) return;
    const member = membersRef.current.find(member => member.id === id);
    if (kind === "share" && (!member || sharesRef.current.some(share => share.recipientMemberId === id))) return;
    const next: Operation = { id: crypto.randomUUID(), fields: note.getFields(), kind, noteId: current.id, title: current.title, recipientId: id, email: member?.email ?? id };
    decisionRef.current = next; setDecision(next); setError(false);
  }
  function cancel() { if (decision && decisionRef.current === decision) { decisionRef.current = null; setDecision(null); } }
  function confirm() {
    const controller = owner.current;
    if (!controller || !decision || decisionRef.current !== decision || intent.current || note.isOwnLocked() || note.getPersisted()?.id !== decision.noteId) return;
    decisionRef.current = null; setDecision(null); void run(decision, controller);
  }
  function accept(operation: Operation, rows?: PrivateKnowledgeNoteShare[]) {
    outcome.current = "applied";
    finishReaderNoteIntent(memberId, knowledgeItemId, operation, "applied");
    if (rows) publish(rows);
    else publish(sharesRef.current.filter(row => row.recipientMemberId !== operation.recipientId));
    if (operation.kind === "share") { recipientRef.current = ""; setRecipient(""); }
    intent.current = null; outcome.current = null; transition("idle"); setError(false);
  }
  async function run(operation: Operation, controller: AbortController) {
    try { prepareReaderNoteIntent(memberId, knowledgeItemId, operation); }
    catch { transition("storage-error"); setError(true); return; }
    outcome.current = null; intent.current = operation; transition("pending");
    try {
      if (operation.kind === "share") {
        const result = await sharePrivateKnowledgeNote(knowledgeItemId, operation.recipientId, fetch, controller.signal);
        if (owner.current !== controller || intent.current !== operation) return;
        if (result.noteId !== operation.noteId) throw new Error("KNOWLEDGE_NOTE_SHARE_INVALID");
        accept(operation, [...sharesRef.current.filter(row => row.recipientMemberId !== operation.recipientId), result]);
      } else {
        await revokePrivateKnowledgeNoteShare(knowledgeItemId, operation.recipientId, fetch, controller.signal);
        if (owner.current === controller && intent.current === operation) accept(operation);
      }
    } catch (cause) {
      if (owner.current !== controller || intent.current !== operation) return;
      // These exact service/repository errors are returned before a write changes a row.
      if (cause instanceof ApiRequestError && operation.kind === "share" && ((cause.status === 400 && cause.code === "PRIVATE_NOTE_SHARE_INVALID") || (cause.status === 404 && cause.code === "PRIVATE_NOTE_SHARE_TARGET_INVALID"))) {
        outcome.current = "rejected";
        try { reject(operation); } catch { transition("unknown"); setError(true); }
      } else { transition("unknown"); setError(true); }
    }
  }
  function reject(operation: Operation) {
    finishReaderNoteIntent(memberId, knowledgeItemId, operation, "rejected");
    intent.current = null; outcome.current = null; transition("load-error"); setError(true);
  }
  async function check() {
    const controller = owner.current; const operation = intent.current;
    if (!controller || !operation || phaseRef.current !== "unknown") return;
    transition("pending");
    try {
      const current = await loadRemotePrivateKnowledgeNote(knowledgeItemId, fetch, controller.signal);
      if (owner.current !== controller || intent.current !== operation) return;
      if (!current || current.access !== "owner" || current.ownerId !== memberId || current.id !== operation.noteId) throw new Error("KNOWLEDGE_NOTE_OWNER_INVALID");
      const rows = validateRows(await listPrivateKnowledgeNoteShares(knowledgeItemId, fetch, controller.signal), operation.noteId);
      if (owner.current !== controller || intent.current !== operation) return;
      if (outcome.current === "rejected") { reject(operation); return; }
      const active = rows.some(row => row.recipientMemberId === operation.recipientId && row.revokedAt === null);
      // Complete owner-scoped listing proves the current target state, not original request causality.
      if (outcome.current === "applied" || active === (operation.kind === "share")) { accept(operation, rows); return; }
    } catch { /* A failed/malformed read is never evidence of absence. */ }
    if (owner.current === controller && intent.current === operation) transition("unknown");
  }
  function retryLoad() { if (owner.current && noteId && (phaseRef.current === "load-error" || phaseRef.current === "storage-error")) void load(owner.current, noteId); }
  return { members, shares, recipient, phase, error, select, request, check, retryLoad, isBlocking, available: !!noteId,
    locked: phase !== "idle" || decision !== null || note.isOwnLocked(),
    confirmation: <ConfirmAction open={decision !== null} title={frontendText(locale, decision?.kind === "revoke" ? "KNOWLEDGE_NOTE_SHARE_REVOKE" : "KNOWLEDGE_NOTE_SHARE_ACTION")}
      description={`${decision?.title ?? ""} — ${decision?.email ?? ""} (${decision?.recipientId ?? ""}) — ${frontendText(locale, decision?.kind === "revoke" ? "KNOWLEDGE_NOTE_REVOKE_IMPACT" : "KNOWLEDGE_NOTE_SHARE_IMPACT")}`}
      cancelLabel={frontendText(locale, "COMMON_CANCEL")} confirmLabel={frontendText(locale, decision?.kind === "revoke" ? "KNOWLEDGE_NOTE_SHARE_REVOKE" : "KNOWLEDGE_NOTE_SHARE_ACTION")}
      destructive={decision?.kind === "revoke"} onCancel={cancel} onConfirm={confirm} /> };
}
