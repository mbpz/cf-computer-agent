import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "../../lib/api";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import {
  clearKnowledgeLifecycleOperation, discardBlockedKnowledgeLifecycleOperation,
  loadKnowledgeLifecycleOperation, prepareKnowledgeLifecycleOperation,
  saveKnowledgeLifecycleOperation, type KnowledgeLifecycleOperation,
} from "../../lib/knowledge-lifecycle-intent";
import { knowledgeItemWriteOutcome, loadAdminKnowledgeItem, loadAdminKnowledgeRevisions, loadKnowledgeLifecycleResolution, sendKnowledgeLifecycleOperation, type KnowledgeRevisionSummary } from "../../lib/admin-knowledge-item-data";
import { KnowledgeItemPage, type KnowledgeItemFeedback, type KnowledgeItemPageState, type KnowledgeItemPendingAction } from "./knowledge-item-page";

export function AdminKnowledgeItemRoute(props: { locale: LocaleRuntime; knowledgeItemId: string; memberId?: string; canReview: boolean }) {
  // A newly selected item must never inherit the previous item's pending write.
  return <KnowledgeItemSession key={props.knowledgeItemId} {...props} />;
}

function KnowledgeItemSession({ locale, knowledgeItemId, memberId, canReview }: { locale: LocaleRuntime; knowledgeItemId: string; memberId?: string; canReview: boolean }) {
  // A recorded operation for this item is an outcome the tab never learned: the
  // page offers its replay rather than a fresh write. Anything not ours (another
  // surface's restore or purge) stays with that surface.
  const [stored] = useState(() => memberId ? loadKnowledgeLifecycleOperation(memberId, knowledgeItemId) : { kind: "empty" as const });
  const adopted = stored.kind === "ready" && (stored.operation.action === "trash" || stored.operation.action === "rollback") ? stored.operation : null;
  const [state, setState] = useState<KnowledgeItemPageState>({ kind: "loading" });
  const [pendingAction, setPendingAction] = useState<KnowledgeItemPendingAction>(null);
  const [feedback, setFeedback] = useState<KnowledgeItemFeedback>(adopted ? { kind: "unknown", message: "" } : { kind: "idle" });
  const [recordBlocked, setRecordBlocked] = useState(stored.kind === "blocked");
  const [trashed, setTrashed] = useState(false);
  const [revisions, setRevisions] = useState<readonly KnowledgeRevisionSummary[]>([]);
  const [nextRevisionCursor, setNextRevisionCursor] = useState<string | null>(null);
  const [historyPending, setHistoryPending] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [resolutionMissed, setResolutionMissed] = useState(false);
  const operationRef = useRef<KnowledgeLifecycleOperation | null>(adopted);
  const writeRef = useRef(false);
  const readRef = useRef<AbortController | null>(null);

  const read = useCallback(async () => {
    const controller = new AbortController();
    readRef.current?.abort(); readRef.current = controller;
    setState({ kind: "loading" });
    try {
      const [item, history] = await Promise.all([
        loadAdminKnowledgeItem(knowledgeItemId, undefined, controller.signal),
        loadAdminKnowledgeRevisions(knowledgeItemId, undefined, undefined, controller.signal).catch(() => null),
      ]);
      if (controller.signal.aborted) return;
      setState({ kind: "ready", item });
      setTrashed(item.status === "trashed");
      setRevisions(history?.revisions ?? []);
      setNextRevisionCursor(history?.nextCursor ?? null);
    } catch (error: unknown) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      if (error instanceof ApiRequestError && error.status === 404) {
        // The item may be trashed or removed; the recycle bin owns it then.
        setState({ kind: "not-found", message: frontendText(locale, "ADMIN_KNOWLEDGE_ITEM_NOT_FOUND") });
      } else if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        setState({ kind: "forbidden", message: frontendText(locale, "ADMIN_REVIEW_FORBIDDEN") });
      } else {
        setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
      }
    }
  }, [knowledgeItemId, locale]);

  useEffect(() => {
    void read();
    return () => { readRef.current?.abort(); };
  }, [read]);

  /**
   * Appends the next older page. A new page replaces whatever the first read
   * loaded only when it resolves after that read; ids are merged so a rollback
   * that changed `isCurrent` cannot duplicate a row.
   */
  async function loadOlderRevisions() {
    if (nextRevisionCursor === null || historyPending) return;
    const cursor = nextRevisionCursor;
    setHistoryPending(true);
    try {
      const page = await loadAdminKnowledgeRevisions(knowledgeItemId, cursor);
      if (!page) return;
      setRevisions((current) => {
        const seen = new Set(current.map((revision) => revision.id));
        return [...current, ...page.revisions.filter((revision) => !seen.has(revision.id))];
      });
      setNextRevisionCursor(page.nextCursor ?? null);
    } catch {
      // A failed older page leaves the verified rows untouched; the button stays.
    } finally {
      setHistoryPending(false);
    }
  }

  // Sends a frozen operation byte for byte, so a retry replays its recorded result.
  const deliver = useCallback(async (operation: KnowledgeLifecycleOperation) => {
    if (!memberId) return;
    try {
      const result = await sendKnowledgeLifecycleOperation(operation);
      clearKnowledgeLifecycleOperation(memberId, operation);
      operationRef.current = null;
      setConfirmTarget(null);
      setResolutionMissed(false);
      if (result.kind === "trash") {
        setTrashed(true);
        setFeedback({ kind: "trashed" });
      } else {
        setFeedback({ kind: "rolled-back", revisionId: result.receipt.revision.id, previousRevisionId: result.receipt.previousRevisionId });
        void read();
      }
    } catch (error: unknown) {
      const outcome = knowledgeItemWriteOutcome(error);
      // An unknown outcome keeps the record: the retry must resend this same
      // operation, never a freshly minted one.
      if (outcome.kind === "unknown-outcome") { setResolutionMissed(false); setFeedback({ kind: "unknown", message: outcome.code }); return; }
      operationRef.current = null;
      const discarded = clearKnowledgeLifecycleOperation(memberId, operation);
      if (!discarded) setRecordBlocked(true);
      if (outcome.kind === "operation-conflict") setFeedback({ kind: "conflict", message: outcome.code });
      else { setFeedback({ kind: "refused", message: outcome.code }); void read(); }
    }
  }, [memberId, read]);

  async function write(action: "trash" | "rollback", revisionId?: string) {
    // One write at a time, and an unresolved operation owns the item until it is
    // retried or discarded.
    if (!canReview || !memberId || writeRef.current || operationRef.current) return;
    writeRef.current = true;
    setPendingAction(action);
    setFeedback({ kind: "idle" });
    try {
      let operation: KnowledgeLifecycleOperation;
      try {
        operation = prepareKnowledgeLifecycleOperation(knowledgeItemId, action, action === "rollback" ? { revisionId } : {});
      } catch (error: unknown) {
        // Nothing was sent, so nothing can be retried; the human fixes the input.
        setFeedback({ kind: "refused", message: error instanceof Error ? error.message : "" });
        return;
      }
      if (!saveKnowledgeLifecycleOperation(memberId, operation)) {
        // Without the record a lost response could be replayed as a fresh write,
        // so the page refuses to send at all.
        setRecordBlocked(true);
        return;
      }
      operationRef.current = operation;
      await deliver(operation);
    } finally {
      writeRef.current = false;
      setPendingAction(null);
    }
  }

  async function retryOperation() {
    const operation = operationRef.current;
    if (!memberId || !operation || writeRef.current) return;
    writeRef.current = true;
    setPendingAction(operation.action === "trash" ? "trash" : "rollback");
    setFeedback({ kind: "idle" });
    try { await deliver(operation); } finally { writeRef.current = false; setPendingAction(null); }
  }

  /**
   * Resolves a stored operation by reading its recorded answer. This never
   * sends the write again: if no receipt exists the page says so and keeps the
   * retry option, so an unknown outcome is never silently turned into success.
   */
  async function resolveOperation() {
    const operation = operationRef.current;
    if (!memberId || !operation || writeRef.current) return;
    const operationNumber = frozenOperationNumber(operation);
    if (operationNumber === null) { setResolutionMissed(true); return; }
    writeRef.current = true;
    setPendingAction(operation.action === "trash" ? "trash" : "rollback");
    try {
      const resolution = await loadKnowledgeLifecycleResolution(knowledgeItemId, operationNumber);
      if (!resolution) { setResolutionMissed(true); return; }
      const matches = operation.action === "trash" ? resolution.kind === "trash" : resolution.kind === "rollback";
      if (!matches) { setResolutionMissed(true); return; }
      if (!clearKnowledgeLifecycleOperation(memberId, operation)) { setRecordBlocked(true); return; }
      operationRef.current = null;
      setResolutionMissed(false);
      setConfirmTarget(null);
      if (resolution.kind === "trash") {
        setTrashed(true);
        setFeedback({ kind: "trashed" });
      } else {
        setFeedback({ kind: "rolled-back", revisionId: resolution.receipt.revision.id, previousRevisionId: resolution.receipt.previousRevisionId });
        void read();
      }
    } catch {
      setResolutionMissed(true);
    } finally {
      writeRef.current = false;
      setPendingAction(null);
    }
  }

  function discardOperation() {
    const operation = operationRef.current;
    if (operation && memberId) clearKnowledgeLifecycleOperation(memberId, operation);
    operationRef.current = null;
    setFeedback({ kind: "idle" });
    // An unreadable record can only be reported as discarded once storage agrees
    // it is gone; claiming otherwise would hide a write that may still replay.
    if (memberId) discardBlockedKnowledgeLifecycleOperation(memberId);
    setRecordBlocked(memberId !== undefined && loadKnowledgeLifecycleOperation(memberId, knowledgeItemId).kind === "blocked");
  }

  return <KnowledgeItemPage state={state} locale={locale} canReview={canReview} trashed={trashed}
    pendingAction={pendingAction} feedback={feedback} recordBlocked={recordBlocked}
    revisions={revisions} confirmTarget={confirmTarget} resolutionMissed={resolutionMissed}
    hasMoreRevisions={nextRevisionCursor !== null} historyPending={historyPending}
    onLoadMoreRevisions={() => { void loadOlderRevisions(); }}
    onRetry={() => { void read(); }}
    onTrash={() => { void write("trash"); }}
    onSelectRollback={setConfirmTarget}
    onConfirmRollback={() => { if (confirmTarget !== null) void write("rollback", confirmTarget); }}
    onCancelRollback={() => setConfirmTarget(null)}
    onRetryOperation={() => { void retryOperation(); }}
    onResolveOperation={() => { void resolveOperation(); }}
    onDiscardOperation={discardOperation} />;
}

/** The operation number frozen inside the stored body; never re-minted on read. */
function frozenOperationNumber(operation: KnowledgeLifecycleOperation): string | null {
  try {
    const parsed: unknown = JSON.parse(operation.body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const value = (parsed as Record<string, unknown>).operationId;
    return typeof value === "string" ? value : null;
  } catch { return null; }
}
