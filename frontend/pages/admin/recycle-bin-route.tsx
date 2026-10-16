import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiRequestError } from "../../lib/api";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { createAsyncOwner } from "../../lib/async-owner";
import { writeWorkspaceHistory } from "../../lib/workspace-location";
import { loadTrashPage, sendTrashOperation } from "../../lib/admin-knowledge-trash-data";
import {
  clearKnowledgeLifecycleOperation,
  discardBlockedKnowledgeLifecycleOperation,
  loadCurrentKnowledgeLifecycleOperation,
  prepareKnowledgeLifecycleOperation,
  saveKnowledgeLifecycleOperation,
  type KnowledgeLifecycleOperation,
} from "../../lib/knowledge-lifecycle-intent";
import { RecycleBinPage, type RecycleBinState, type TrashFeedback } from "./recycle-bin-page";

const pageLimit = 20;

/**
 * The recycle-bin session. It owns the cursor read, the load-more append, the
 * in-flight/one-operation-at-a-time lock, the 401/403 → forbidden transition and
 * the saved operation identity: a write is recorded before it is sent, so a lost
 * response can resend the same number and the same body, and an unresolved
 * operation locks the surface until it is retried or discarded.
 */
export function RecycleBinRoute({ locale, memberId, canReview }: { locale: LocaleRuntime; memberId?: string; canReview: boolean }) {
  const [initial] = useState(() => memberId && canReview
    ? loadCurrentKnowledgeLifecycleOperation(memberId)
    : { kind: "empty" as const });
  const [state, setState] = useState<RecycleBinState>(() => canReview
    ? { kind: "loading" }
    : { kind: "forbidden", message: frontendText(locale, "ADMIN_REVIEW_FORBIDDEN") });
  const [operation, setOperation] = useState<KnowledgeLifecycleOperation | null>(initial.kind === "ready" ? initial.operation : null);
  const [recordBlocked, setRecordBlocked] = useState(initial.kind === "blocked");
  const [recordNotice, setRecordNotice] = useState<string | undefined>(undefined);
  const [feedback, setFeedback] = useState<TrashFeedback | undefined>(initial.kind === "ready" ? { kind: "unknown" } : undefined);
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"restore" | "purge" | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState<Record<string, string>>({});
  const owner = useMemo(() => createAsyncOwner(), []);
  const readRef = useRef<AbortController | null>(null);
  const writeRef = useRef(false);
  const aliveRef = useRef(true);
  const operationRef = useRef<KnowledgeLifecycleOperation | null>(initial.kind === "ready" ? initial.operation : null);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; owner.invalidate(); readRef.current?.abort(); readRef.current = null; };
  }, [owner]);

  const read = useCallback(async (cursor?: string, append = false) => {
    if (readRef.current) return;
    const controller = new AbortController();
    readRef.current = controller;
    const current = owner.claim();
    if (!append) setState((previous) => (previous.kind === "ready" ? previous : { kind: "loading" }));
    try {
      const page = await loadTrashPage({ limit: pageLimit, cursor, requester: fetch, signal: controller.signal });
      if (!owner.isCurrent(current)) return;
      setState((previous) => ({
        kind: "ready",
        items: append && previous.kind === "ready" ? [...previous.items, ...page.items] : page.items,
        ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      }));
    } catch (error) {
      if (!owner.isCurrent(current) || controller.signal.aborted) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        setState({ kind: "forbidden", message: frontendText(locale, "ADMIN_REVIEW_FORBIDDEN") });
      } else {
        setState({ kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
      }
    } finally {
      if (readRef.current === controller) readRef.current = null;
    }
  }, [locale, owner]);

  useEffect(() => {
    if (!canReview) return;
    void read();
    return () => { readRef.current?.abort(); readRef.current = null; };
  }, [canReview, read]);

  function releaseOperation(target: KnowledgeLifecycleOperation) {
    if (memberId) clearKnowledgeLifecycleOperation(memberId, target);
    operationRef.current = null;
    setOperation(null);
  }

  async function send(target: KnowledgeLifecycleOperation) {
    if (writeRef.current || operationRef.current !== target || !aliveRef.current) return;
    writeRef.current = true;
    setPending(true);
    setBusyId(target.id);
    setBusyAction(target.action === "purge" ? "purge" : "restore");
    try {
      const outcome = await sendTrashOperation(target, fetch);
      if (!aliveRef.current) return;
      if (memberId && !clearKnowledgeLifecycleOperation(memberId, target)) {
        // The write committed but its record could not be removed: the outcome
        // cannot be re-checked, so the surface offers no new write.
        setRecordBlocked(true);
        setRecordNotice(frontendText(locale, "ADMIN_TRASH_RECORD_BLOCKED"));
        setFeedback({ kind: "unknown" });
        return;
      }
      operationRef.current = null;
      setOperation(null);
      setRecordNotice(undefined);
      setState((previous) => previous.kind === "ready"
        ? { ...previous, items: previous.items.filter((item) => item.id !== target.id) }
        : previous);
      if (outcome.kind === "restored") setFeedback({ kind: "restored", knowledgeItemId: outcome.knowledge.id, visibility: outcome.knowledge.visibility });
      else setFeedback(outcome.result.alreadyPurged ? { kind: "purge-nothing" } : { kind: "purged", count: outcome.result.purgedRevisionCount });
    } catch (error) {
      if (!aliveRef.current) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        // Access denial does not prove that the write failed to commit.
        setState({ kind: "forbidden", message: frontendText(locale, "ADMIN_REVIEW_FORBIDDEN") });
        return;
      }
      if (error instanceof ApiRequestError && error.code === "KNOWLEDGE_OPERATION_CONFLICT") {
        releaseOperation(target);
        setFeedback({ kind: "conflict" });
        return;
      }
      if (error instanceof ApiRequestError && error.code === "KNOWLEDGE_PURGE_CONFIRMATION_REQUIRED") {
        releaseOperation(target);
        setFeedback({ kind: "purge-refused" });
        return;
      }
      if (error instanceof ApiRequestError && !error.retryable && error.status < 500) {
        releaseOperation(target);
        setFeedback({ kind: "write-refused" });
        return;
      }
      // Network failure, 5xx or a retryable refusal: the outcome is unknown, so
      // keep the recorded operation and let the retry resend it unchanged.
      setFeedback({ kind: "unknown" });
    } finally {
      writeRef.current = false;
      setPending(false);
      setBusyId(null);
      setBusyAction(null);
    }
  }

  function start(target: KnowledgeLifecycleOperation) {
    if (memberId && !saveKnowledgeLifecycleOperation(memberId, target)) {
      setRecordNotice(frontendText(locale, "ADMIN_REVIEW_DECISION_NOT_RECORDED"));
      return;
    }
    operationRef.current = target;
    setOperation(target);
    setFeedback(undefined);
    void send(target);
  }

  function restore(knowledgeItemId: string) {
    if (!canReview || writeRef.current || operationRef.current) return;
    try { start(prepareKnowledgeLifecycleOperation(knowledgeItemId, "restore")); } catch { return; }
  }

  function purge(knowledgeItemId: string) {
    if (!canReview || writeRef.current || operationRef.current) return;
    const confirm = purgeConfirm[knowledgeItemId] ?? "";
    if (confirm !== knowledgeItemId) return;
    try { start(prepareKnowledgeLifecycleOperation(knowledgeItemId, "purge", { confirm })); } catch { return; }
  }

  return <RecycleBinPage
    locale={locale}
    state={state}
    pending={pending}
    locked={operation !== null}
    busyId={busyId}
    busyAction={busyAction}
    feedback={feedback}
    recordNotice={recordNotice}
    recordBlocked={recordBlocked}
    purgeConfirm={purgeConfirm}
    onPurgeConfirmChange={(knowledgeItemId, value) => setPurgeConfirm((previous) => ({ ...previous, [knowledgeItemId]: value }))}
    onRetry={() => { void read(); }}
    onLoadMore={() => {
      if (pending || operationRef.current || state.kind !== "ready" || state.nextCursor === undefined) return;
      void read(state.nextCursor, true);
    }}
    onRestore={canReview ? restore : undefined}
    onPurge={canReview ? purge : undefined}
    onOpenItem={(knowledgeItemId) => writeWorkspaceHistory("push", `/admin/knowledge/${encodeURIComponent(knowledgeItemId)}`)}
    onRetryOperation={() => { const target = operationRef.current; if (target) void send(target); }}
    onDiscardOperation={() => {
      if (!memberId || !discardBlockedKnowledgeLifecycleOperation(memberId)) return;
      setRecordBlocked(false);
      setRecordNotice(undefined);
    }}
  />;
}
