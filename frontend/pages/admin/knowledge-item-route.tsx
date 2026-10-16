import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "../../lib/api";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import {
  clearKnowledgeLifecycleOperation, discardBlockedKnowledgeLifecycleOperation,
  loadKnowledgeLifecycleOperation, prepareKnowledgeLifecycleOperation,
  saveKnowledgeLifecycleOperation, type KnowledgeLifecycleOperation,
} from "../../lib/knowledge-lifecycle-intent";
import { knowledgeItemWriteOutcome, loadAdminKnowledgeItem, sendKnowledgeLifecycleOperation } from "../../lib/admin-knowledge-item-data";
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
  const operationRef = useRef<KnowledgeLifecycleOperation | null>(adopted);
  const writeRef = useRef(false);
  const readRef = useRef<AbortController | null>(null);

  const read = useCallback(async () => {
    const controller = new AbortController();
    readRef.current?.abort(); readRef.current = controller;
    setState({ kind: "loading" });
    try {
      const item = await loadAdminKnowledgeItem(knowledgeItemId, undefined, controller.signal);
      if (controller.signal.aborted) return;
      setState({ kind: "ready", item });
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

  // Sends a frozen operation byte for byte, so a retry replays its recorded result.
  const deliver = useCallback(async (operation: KnowledgeLifecycleOperation) => {
    if (!memberId) return;
    try {
      const result = await sendKnowledgeLifecycleOperation(operation);
      clearKnowledgeLifecycleOperation(memberId, operation);
      operationRef.current = null;
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
      if (outcome.kind === "unknown-outcome") { setFeedback({ kind: "unknown", message: outcome.code }); return; }
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
    onRetry={() => { void read(); }}
    onTrash={() => { void write("trash"); }}
    onRollback={(revisionId) => { void write("rollback", revisionId); }}
    onRetryOperation={() => { void retryOperation(); }}
    onDiscardOperation={discardOperation} />;
}
