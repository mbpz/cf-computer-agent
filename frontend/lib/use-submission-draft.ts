import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearDraftRecord,
  clearDraftWriteIntent,
  createDraftDiscardIntent,
  createDraftRecord,
  createDraftWriteIntent,
  discardDraft,
  draftBody,
  loadDraftRecord,
  loadDraftWriteIntent,
  matchesBody,
  readDraft,
  resolveDraftWriteIntent,
  saveDraftRecord,
  saveDraftWriteIntent,
  writeDraft,
  type DraftBody,
  type DraftSaveIntent,
  type DraftWriteIntent,
  type SubmissionDraftFields,
  type SubmissionDraftSaveState,
} from "./submission-draft-data";
import { clearOfflineSubmissionDraft, saveOfflineSubmissionDraft } from "./offline-submission-draft";
import type { SubmissionTarget } from "./submission-data";
import { subscribeWorkspaceLocation } from "./workspace-location";

/** Idle time before a keystroke is sent to the draft endpoint. */
const DEBOUNCE_MS = 1200;

export interface SubmissionDraftWrites {
  /** What the server currently holds for this text, told honestly. */
  state: SubmissionDraftSaveState;
  /** Saves the current text now. */
  saveNow: () => void;
  /** Re-reads the journaled write before anything else is sent. */
  recheck: () => void;
  /** Discards the server draft this browser owns, once the server confirms it. */
  discard: () => void;
  /** Called after an accepted submission: this browser forgets the draft it owned. */
  release: () => void;
}

/**
 * Keeps the editor's text in the server draft endpoints
 * (`POST /api/submissions/drafts`, `GET|PATCH|DELETE /api/submissions/drafts/:id`)
 * on the same cadence the local mirror used — a short idle debounce, plus a
 * flush before an unload or a location change — and mirrors it into browser
 * storage so a reload always renders the visitor's text even when the server
 * copy cannot be read.
 *
 * A write is journaled before it leaves, and a journaled write whose outcome was
 * never observed is re-read before it is repeated, so an unknown result can
 * never turn into a second draft. A discard uses that same journal: it is re-read
 * before it is repeated, and it is only ever reported as discarded — which also
 * clears the local copy — once the server has answered for it.
 */
export function useSubmissionDraft(options: {
  memberId: string;
  enabled: boolean;
  fields: SubmissionDraftFields;
  /**
   * The owning form's live field record. It is the same text, but it is already
   * updated when a committed navigation resets the shared draft guard inside the
   * same event, before this component unmounts.
   */
  liveFields?: { readonly current: SubmissionDraftFields };
  target: SubmissionTarget | null;
  /** True while this form's own submission request is in flight. */
  suspended: boolean;
  /**
   * Called once the server confirmed a discard, so the owning editor clears the
   * text this browser no longer keeps anywhere.
   */
  onDiscarded?: () => void;
}): SubmissionDraftWrites {
  const { memberId, enabled, fields, liveFields, target, suspended } = options;
  const [state, setState] = useState<SubmissionDraftSaveState>({ kind: "idle" });
  const fieldsRef = useRef(fields); fieldsRef.current = fields;
  /** The live text: the owning form's record when it exposes one. */
  const readFields = () => (liveFields ? liveFields.current : fieldsRef.current);
  const targetRef = useRef(target); targetRef.current = target;
  const enabledRef = useRef(enabled); enabledRef.current = enabled;
  const suspendedRef = useRef(suspended); suspendedRef.current = suspended;
  const alive = useRef(true);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  /** The latest `onDiscarded`, so `forget` stays a stable callback. */
  const onDiscardedRef = useRef(options.onDiscarded);
  onDiscardedRef.current = options.onDiscarded;
  /** The server draft this browser owns, and the destination that draft carries. */
  const draftId = useRef<string | null>(null);
  /** Fingerprint and server timestamp of the last draft write the server confirmed. */
  const confirmed = useRef<{ fingerprint: string; at: string } | null>(null);

  const fingerprint = (body: Pick<DraftBody, "kind" | "title" | "content">) => JSON.stringify([body.kind, body.title, body.content]);
  /** What the editor currently shows, independent of any destination. */
  const currentFields = () => ({ kind: readFields().mode, title: readFields().title.trim(), content: readFields().content });

  const adopt = useCallback((nextDraftId: string | null, nextTarget: SubmissionTarget | null, at: string, body: DraftBody) => {
    draftId.current = nextDraftId;
    confirmed.current = { fingerprint: fingerprint(body), at };
    saveDraftRecord(memberId, createDraftRecord(nextDraftId, nextTarget));
  }, [memberId]);

  /**
   * This browser forgets the draft entirely, which is only ever reached from a
   * server answer: a discard the server confirmed, or a draft it no longer
   * knows. The editor is then told to clear the text it still holds, so nothing
   * can mirror it back and a reload cannot resurrect it.
   */
  const forget = useCallback(() => {
    draftId.current = null;
    confirmed.current = null;
    clearDraftRecord(memberId);
    clearOfflineSubmissionDraft(memberId);
    onDiscardedRef.current?.();
    setState({ kind: "idle" });
  }, [memberId]);

  const send = useCallback(async (intent: DraftWriteIntent, journaled = false): Promise<void> => {
    if (!alive.current || busy.current) return;
    busy.current = true;
    const active = new AbortController();
    controller.current = active;
    if (!journaled && !saveDraftWriteIntent(memberId, intent)) {
      busy.current = false;
      controller.current = null;
      if (alive.current) {
        // Another journaled write is still unresolved: its outcome has to be read
        // before this one is sent, so nothing is written over it.
        const pending = loadDraftWriteIntent(memberId);
        setState(pending.kind === "ready"
          ? { kind: "unconfirmed", reason: intent.op === "discard" ? "discard_unknown" : "unknown" }
          : { kind: "unconfirmed", reason: "storage" });
      }
      return;
    }
    if (alive.current) setState({ kind: intent.op === "discard" ? "discarding" : "saving" });
    try {
      if (intent.op === "discard") {
        await discardDraft(intent.draftId, { signal: active.signal });
        if (!alive.current || active.signal.aborted) return;
        clearDraftWriteIntent(memberId, intent.startedAt);
        forget();
        return;
      }
      const draft = await writeDraft(intent, { signal: active.signal });
      if (!alive.current || active.signal.aborted) return;
      if (!matchesBody(draft, intent.body)) {
        // The server holds something other than the journaled request: keep the
        // intent so the visitor can re-read it instead of writing over it.
        setState({ kind: "unconfirmed", reason: "unknown" });
        return;
      }
      clearDraftWriteIntent(memberId, intent.startedAt);
      const stored = saveDraftRecord(memberId, createDraftRecord(draft.id, draft.target));
      adopt(draft.id, draft.target, draft.updatedAt, intent.body);
      setState(stored ? { kind: "saved", at: draft.updatedAt } : { kind: "saved", at: draft.updatedAt, reason: "storage" });
    } catch (error) {
      if (!alive.current || active.signal.aborted) return;
      // A rejected request proves nothing was written; a transport failure or a
      // server error leaves the outcome unknown, so the intent stays readable.
      const rejected = error !== null && typeof error === "object" && "status" in error
        && typeof error.status === "number" && error.status < 500;
      if (rejected) clearDraftWriteIntent(memberId, intent.startedAt);
      // A refused discard is never reported as a discarded draft: the text the
      // visitor still holds has to stay readable and saved-able.
      const discarding = intent.op === "discard";
      setState({ kind: "unconfirmed", reason: discarding
        ? (rejected ? "discard_error" : "discard_unknown")
        : (rejected ? "error" : "unknown") });
    } finally {
      if (controller.current === active) controller.current = null;
      busy.current = false;
    }
  }, [adopt, forget, memberId]);

  /**
   * Sends `body`, resolving a journaled operation of an earlier attempt first.
   * `body` is null only for a recheck of a journaled discard: nothing is written
   * by that path, so there is no text to describe.
   */
  const runPipeline = useCallback(async (body: DraftBody | null, mode: "save" | "recheck"): Promise<void> => {
    if (!alive.current || busy.current) return;
    const journaled = loadDraftWriteIntent(memberId);
    if (journaled.kind === "invalid" || journaled.kind === "unavailable") {
      setState({ kind: "unconfirmed", reason: journaled.kind === "invalid" ? "unknown" : "storage" });
      return;
    }
    if (journaled.kind === "ready") {
      const active = new AbortController();
      controller.current = active;
      let resolution;
      try {
        resolution = await resolveDraftWriteIntent(journaled.intent, { signal: active.signal });
      } finally {
        if (controller.current === active) controller.current = null;
      }
      if (!alive.current || active.signal.aborted) return;
      if (journaled.intent.op === "discard") {
        // The journal holds a discard, not a save. Only the draft's own absence
        // settles it: the text on screen was never written by this operation, so
        // it neither proves nor disproves it.
        if (resolution.kind === "pending") {
          setState({ kind: "unconfirmed", reason: "discard_unknown" });
          return;
        }
        if (resolution.kind === "discarded") {
          clearDraftWriteIntent(memberId, journaled.intent.startedAt);
          forget();
          return;
        }
        // The discard did not land, so the draft is still there: a recheck says
        // exactly that, and a save continues with the text below.
        clearDraftWriteIntent(memberId, journaled.intent.startedAt);
        if (mode === "recheck") {
          setState({ kind: "unconfirmed", reason: "discard_error" });
          return;
        }
      } else if (resolution.kind === "resolved") {
        clearDraftWriteIntent(memberId, journaled.intent.startedAt);
        adopt(resolution.draft.id, resolution.draft.target, resolution.draft.updatedAt, journaled.intent.body);
        const current = draftBody(targetRef.current, readFields());
        if (current && fingerprint(current) === confirmed.current?.fingerprint) {
          setState({ kind: "saved", at: resolution.draft.updatedAt });
          return;
        }
      } else if (resolution.kind === "pending") {
        setState({ kind: "unconfirmed", reason: "unknown" });
        return;
      }
      // "resend", "recreate" and a discard that did not land all continue with
      // the current text below.
      if (mode === "recheck") {
        setState({ kind: "unconfirmed", reason: "error" });
        return;
      }
    }
    if (mode === "recheck") {
      setState(confirmed.current ? { kind: "saved", at: confirmed.current.at } : { kind: "unconfirmed", reason: "error" });
      return;
    }
    if (!body) {
      // No text survived the journal above, so there is nothing left to write.
      setState(confirmed.current ? { kind: "saved", at: confirmed.current.at } : { kind: "unconfirmed", reason: "error" });
      return;
    }
    const op = draftId.current === null ? "create" : "update";
    await send(createDraftWriteIntent(op, draftId.current, body));
  }, [adopt, forget, memberId, send]);

  const saveCurrent = useCallback((mode: "save" | "recheck") => {
    const body = draftBody(targetRef.current, readFields());
    if (!body) {
      // A journaled discard is settled by re-reading the record, not by any text,
      // so a recheck still resolves it even when the editor is empty.
      const journaled = loadDraftWriteIntent(memberId);
      if (mode === "recheck" && journaled.kind === "ready" && journaled.intent.op === "discard") {
        void runPipeline(null, "recheck");
        return;
      }
      const text = readFields().title.trim() !== "" || readFields().content.trim() !== "";
      setState(text ? { kind: "unconfirmed", reason: "no_target" } : { kind: "idle" });
      return;
    }
    void runPipeline(body, mode);
  }, [memberId, runPipeline]);

  /**
   * Discards the draft this browser owns. Whatever was journaled is read back
   * first, because an unresolved save may be the very draft this has to remove;
   * the discard itself is then journaled and sent, and only the server's answer
   * lets the page say the draft is gone.
   */
  const discard = useCallback(async (): Promise<void> => {
    if (!alive.current || busy.current) return;
    const journaled = loadDraftWriteIntent(memberId);
    if (journaled.kind === "invalid" || journaled.kind === "unavailable") {
      setState({ kind: "unconfirmed", reason: journaled.kind === "invalid" ? "discard_unknown" : "storage" });
      return;
    }
    let target = draftId.current;
    if (journaled.kind === "ready") {
      const intent = journaled.intent;
      const active = new AbortController();
      controller.current = active;
      let resolution;
      try {
        resolution = await resolveDraftWriteIntent(intent, { signal: active.signal });
      } finally {
        if (controller.current === active) controller.current = null;
      }
      if (!alive.current || active.signal.aborted) return;
      if (resolution.kind === "pending") {
        setState({ kind: "unconfirmed", reason: "discard_unknown" });
        return;
      }
      clearDraftWriteIntent(memberId, intent.startedAt);
      if (intent.op === "discard") {
        // The record's own absence is what settles a discard: it either landed
        // already — which is this same outcome — or it did not land at all, and
        // the draft it named is still there for the discard below.
        if (resolution.kind === "discarded") {
          forget();
          return;
        }
      } else if (resolution.kind === "resolved") {
        // The unresolved save is the draft this discard has to remove.
        target = resolution.draft.id;
        adopt(resolution.draft.id, resolution.draft.target, resolution.draft.updatedAt, intent.body);
      } else if (resolution.kind === "recreate") {
        target = null;
      }
    }
    if (target === null) {
      // The server holds no draft for this browser, so there is nothing to
      // discard there; the local copy still goes.
      forget();
      return;
    }
    await send(createDraftDiscardIntent(target));
  }, [adopt, forget, memberId, send]);

  // Restore: name the server draft this browser owns, then confirm what it holds.
  useEffect(() => {
    alive.current = true;
    if (!enabledRef.current) return () => { alive.current = false; };
    const active = new AbortController();
    controller.current = active;
    const stored = loadDraftRecord(memberId);
    if (stored.kind === "unavailable" || stored.kind === "invalid") {
      setState({ kind: "unconfirmed", reason: stored.kind === "invalid" ? "unknown" : "storage" });
      return () => { alive.current = false; active.abort(); };
    }
    if (stored.kind === "ready") draftId.current = stored.record.draftId;
    const openDraftId = stored.kind === "ready" ? stored.record.draftId : null;
    const restored = (async () => {
      if (openDraftId) {
        try {
          const draft = await readDraft(openDraftId, { signal: active.signal });
          if (!alive.current || active.signal.aborted) return;
          const serverBody: DraftBody = { ...draft.target, kind: draft.kind, title: draft.title, content: draft.content };
          adopt(draft.id, draft.target, draft.updatedAt, serverBody);
          // The text is compared on its own fields: the destination may still be
          // loading, and that says nothing about what the server holds.
          if (fingerprint(currentFields()) === fingerprint(serverBody)) {
            setState({ kind: "saved", at: draft.updatedAt });
            return;
          }
        } catch (error) {
          if (!alive.current || active.signal.aborted) return;
          const missing = error !== null && typeof error === "object" && "status" in error && error.status === 404;
          if (missing) {
            // The server no longer knows this draft: forget it and let the next
            // save create a fresh one, without discarding the visitor's text.
            clearDraftRecord(memberId);
            draftId.current = null;
          } else {
            setState({ kind: "unconfirmed", reason: "error" });
          }
        }
      }
      if (!alive.current || active.signal.aborted) return;
      if (confirmed.current && fingerprint(currentFields()) === confirmed.current.fingerprint) {
        setState({ kind: "saved", at: confirmed.current.at });
        return;
      }
      saveCurrent("save");
    })();
    void restored;
    return () => { alive.current = false; active.abort(); if (controller.current === active) controller.current = null; };
    // The editor is member-scoped: a member change mounts a new form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  // Debounced save after the last edit, on the cadence the local mirror used.
  useEffect(() => {
    if (!enabled || suspended || alive.current === false) return;
    const text = fields.title.trim() !== "" || fields.content.trim() !== "";
    if (!text) {
      if (confirmed.current === null) setState({ kind: "idle" });
      return;
    }
    if (!target) {
      setState({ kind: "unconfirmed", reason: "no_target" });
      return;
    }
    const body = draftBody(target, fields);
    if (!body) {
      setState({ kind: "unconfirmed", reason: "error" });
      return;
    }
    if (confirmed.current?.fingerprint === fingerprint(body)) {
      // A destination that arrived after the text was saved must not downgrade it.
      setState({ kind: "saved", at: confirmed.current.at });
      return;
    }
    // The edits are not on the server yet, and the page says so until they are.
    setState({ kind: "unconfirmed", reason: "unsaved" });
    const timer = setTimeout(() => { void runPipeline(body, "save"); }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, suspended, fields.mode, fields.title, fields.content, target?.requestedSpaceId, target?.requestedCollectionId, target?.requestedVisibility, runPipeline]);

  // The local mirror stays the synchronous, unload-safe copy of the text.
  useEffect(() => {
    if (!enabled) return;
    saveOfflineSubmissionDraft(memberId, fields);
  }, [enabled, memberId, fields.mode, fields.title, fields.content]);

  // Flush before the page goes away or the location changes: the write intent is
  // journaled synchronously, so an unanswered request is recoverable, never lost.
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      // The shared draft guard resets its own record on committed navigation, so
      // mirroring it here is what keeps this browser's copy in step even when the
      // form unmounts before a state effect could run.
      saveOfflineSubmissionDraft(memberId, readFields());
      if (suspendedRef.current) return;
      const body = draftBody(targetRef.current, readFields());
      if (!body || confirmed.current?.fingerprint === fingerprint(body)) return;
      const intent = createDraftWriteIntent(draftId.current === null ? "create" : "update", draftId.current, body);
      // The journal is synchronous, so the attempt survives the page it was made on;
      // the request is then sent with its own lifetime and reported when it answers.
      if (!saveDraftWriteIntent(memberId, intent)) return;
      void send(intent, true);
    };
    const onHidden = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    const unsubscribe = subscribeWorkspaceLocation(flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
      unsubscribe();
    };
  }, [enabled, memberId]);

  const release = useCallback(() => {
    clearDraftRecord(memberId);
    const journaled = loadDraftWriteIntent(memberId);
    if (journaled.kind === "ready") clearDraftWriteIntent(memberId, journaled.intent.startedAt);
    clearOfflineSubmissionDraft(memberId);
    draftId.current = null;
    confirmed.current = null;
    setState({ kind: "idle" });
  }, [memberId]);

  return { state, saveNow: () => saveCurrent("save"), recheck: () => saveCurrent("recheck"), discard: () => { void discard(); }, release };
}
