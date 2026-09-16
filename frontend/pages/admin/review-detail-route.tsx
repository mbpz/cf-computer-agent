import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { ApiRequestError, type Fetcher } from "../../lib/api";
import { loadReviewDetail, submitReviewDecision, type ReviewDecision, type ReviewDetailData } from "../../components/review/review-detail-data";
import { ReviewDetailPage, type ReviewDecisionState, type ReviewDetailState } from "./review-detail-page";
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

  const read = useCallback(async () => {
    if (readRef.current || decisionRef.current) return;
    const controller = new AbortController();
    readRef.current = controller;
    const current = owner.claim();
    setState({ kind: "loading" });
    setDecisionState({ kind: "idle" });
    try {
      const data = await loadReviewDetail(id, requester, controller.signal);
      if (owner.isCurrent(current)) setState({ kind: "ready", data });
    } catch (error) {
      if (!owner.isCurrent(current) || controller.signal.aborted) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        setState({ kind: "forbidden", message: frontendText(locale, "ADMIN_REVIEW_FORBIDDEN") });
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
    };
  }, [owner, read]);

  const decide = async (action: ReviewDecision) => {
    if (readRef.current || decisionRef.current || state.kind !== "ready" || state.data.detail.id !== id || state.data.detail.status !== "review_pending") return;
    const decision = {};
    decisionRef.current = decision;
    const current = owner.claim();
    setDecisionState({ kind: "pending", action });
    try {
      await submitReviewDecision(id, action, state.data.publish, requester);
      if (!owner.isCurrent(current)) return;
      const status = action === "publish" ? "published" : action === "reject" ? "rejected" : "revision_requested";
      setState({ kind: "ready", data: { ...state.data, detail: Object.freeze({ ...state.data.detail, status }) } });
      setDecisionState({ kind: "success", action });
    } catch (error) {
      if (!owner.isCurrent(current)) return;
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        setState({ kind: "forbidden", message: frontendText(locale, "ADMIN_REVIEW_FORBIDDEN") });
        setDecisionState({ kind: "idle" });
      } else {
        setDecisionState({ kind: "error", action, message: frontendText(locale, "ADMIN_REVIEW_ACTION_ERROR") });
      }
      if (decisionRef.current === decision) decisionRef.current = null;
    }
  };

  const pageState: ReviewDetailState = state.kind === "ready" ? { kind: "ready", detail: state.data.detail } : state;
  return <ReviewDetailPage locale={locale} state={pageState} decisionState={decisionState} onRetry={() => { void read(); }} onDecision={(action) => { void decide(action); }} comments={<ReviewCommentsPanel submissionId={id} locale={locale} requester={requester} />} />;
}
