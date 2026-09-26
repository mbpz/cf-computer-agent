import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { ApiRequestError, type Fetcher } from "../../lib/api";
import { loadReviewDetail, prepareReviewDecision, sendReviewDecision, reviewRecovery, type ReviewDecision, type ReviewDetailData, type ReviewOperation, type ReviewNoteInput } from "../../components/review/review-detail-data";
import { ReviewDetailPage, type ReviewDecisionState, type ReviewDetailState } from "./review-detail-page";
import { writeWorkspaceHistory } from "../../lib/workspace-location";
import { createAsyncOwner } from "../../lib/async-owner";
import { ReviewCommentsPanel } from "../../components/review/review-comments-panel";

export type ReviewDetailRouteState = { kind: "loading" } | { kind: "ready"; data: ReviewDetailData } | { kind: "error" | "forbidden" | "not-found"; message: string };

export function ReviewDetailRoute({ id, locale, requester = fetch }: { id: string; locale?: LocaleRuntime; requester?: Fetcher }) {
  // A newly selected object must never render the previous object's actions.
  return <ReviewDetailSession key={id} id={id} locale={locale} requester={requester} />;
}

function ReviewDetailSession({ id, locale, requester }: { id: string; locale?: LocaleRuntime; requester: Fetcher }) {
  const [state, setState] = useState<ReviewDetailRouteState>({ kind: "loading" });
  const [decisionState, setDecisionState] = useState<ReviewDecisionState>({ kind: "idle" });
  const owner = useMemo(() => createAsyncOwner(), []);
  const readRef = useRef<AbortController | null>(null);
  const decisionRef = useRef<object | null>(null);
  const operationRef = useRef<ReviewOperation | null>(null);

  const read = useCallback(async () => {
    if (readRef.current || decisionRef.current) return;
    const controller = new AbortController();
    readRef.current = controller;
    const current = owner.claim();
    setState({ kind: "loading" });
    if (!operationRef.current) setDecisionState({ kind: "idle" });
    try {
      const data = await loadReviewDetail(id, requester, controller.signal);
      if (owner.isCurrent(current)) {
        setState({ kind: "ready", data });
        // Pending (or an unrecognized status) cannot disprove an in-flight commit.
        if (operationRef.current && ["published", "rejected", "revision_requested"].includes(data.detail.status)) {
          operationRef.current = null;
          setDecisionState({ kind: "idle" });
        }
      }
    } catch (error) {
      if (!owner.isCurrent(current) || controller.signal.aborted) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        setState({ kind: "forbidden", message: frontendText(locale, "ADMIN_REVIEW_FORBIDDEN") });
        operationRef.current = null; setDecisionState({ kind: "idle" });
      } else if (error instanceof ApiRequestError && error.status === 404) {
        setState({ kind: "not-found", message: frontendText(locale, "ADMIN_REVIEW_NOT_FOUND") });
      } else {
        setState({ kind: "error", message: frontendText(locale, "ADMIN_REVIEW_LOAD_ERROR") });
      }
    } finally {
      if (readRef.current === controller) readRef.current = null;
    }
  }, [id, locale, owner, requester]);

  useEffect(() => {
    void read();
    return () => {
      owner.invalidate();
      readRef.current?.abort();
      readRef.current = null;
      decisionRef.current = null;
      operationRef.current = null;
    };
  }, [owner, read]);

  const send = async (operation: ReviewOperation, previouslyUncertain = false) => {
    if (readRef.current || decisionRef.current || state.kind !== "ready" || state.data.detail.id !== operation.id) return;
    const { action } = operation;
    const decision = {};
    decisionRef.current = decision;
    const current = owner.claim();
    setDecisionState({ kind: "pending", action });
    try {
      const receipt = await sendReviewDecision(operation, requester);
      if (!owner.isCurrent(current)) return;
      setState({ kind: "ready", data: { ...state.data, detail: Object.freeze({ ...state.data.detail, status: receipt.status }) } });
      setDecisionState({ kind: "success", receipt });
    } catch (error) {
      if (!owner.isCurrent(current)) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        setState({ kind: "forbidden", message: frontendText(locale, "ADMIN_REVIEW_FORBIDDEN") });
        setDecisionState({ kind: "idle" });
        operationRef.current = null;
      } else {
        const recovery = reviewRecovery(error, previouslyUncertain);
        if (recovery === "edit") operationRef.current = null;
        setDecisionState({ kind: "error", action, recovery });
      }
    } finally {
      if (decisionRef.current === decision) decisionRef.current = null;
    }
  };

  const decide = (action: ReviewDecision, details?: ReviewNoteInput) => {
    if (readRef.current || decisionRef.current || operationRef.current || state.kind !== "ready" || state.data.detail.status !== "review_pending") return;
    try {
      const operation = prepareReviewDecision(id, action, state.data.publish, details);
      operationRef.current = operation;
      void send(operation);
    } catch { setDecisionState({ kind: "error", action, recovery: "edit" }); }
  };

  const pageState: ReviewDetailState = state.kind === "ready" ? { kind: "ready", detail: state.data.detail } : state;
  return <ReviewDetailPage onBack={() => writeWorkspaceHistory("push", "/admin/submissions")} locale={locale} state={pageState} decisionState={decisionState}
    onRetry={() => { void read(); }} onRetryDecision={() => { if (decisionState.kind === "error" && decisionState.recovery === "retry" && operationRef.current) void send(operationRef.current, true); }}
    onDecision={decide} comments={<ReviewCommentsPanel submissionId={id} locale={locale} requester={requester} />} />;
}
