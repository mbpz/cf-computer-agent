import { useEffect, useRef, useState } from "react";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { Fetcher } from "../../lib/api";
import { loadReviewDetail, submitReviewDecision, type ReviewDecision, type ReviewDetailData } from "../../components/review/review-detail-data";
import { ReviewDetailPage, type ReviewDecisionState, type ReviewDetailState } from "./review-detail-page";

export type ReviewDetailRouteState = { kind: "loading" } | { kind: "ready"; data: ReviewDetailData } | { kind: "error"; message: string };

export function ReviewDetailRoute({ id, locale, requester = fetch }: { id: string; locale?: LocaleRuntime; requester?: Fetcher }) {
  const [state, setState] = useState<ReviewDetailRouteState>({ kind: "loading" });
  const [decisionState, setDecisionState] = useState<ReviewDecisionState>({ kind: "idle" });
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setState({ kind: "loading" });
    setDecisionState({ kind: "idle" });
    loadReviewDetail(id, requester).then((data) => {
      if (current === generation.current) setState({ kind: "ready", data });
    }).catch(() => {
      if (current === generation.current) setState({ kind: "error", message: frontendText(locale, "ADMIN_REVIEW_LOAD_ERROR") });
    });
  }, [id, locale, requester]);

  const decide = async (action: ReviewDecision) => {
    const current = generation.current;
    if (state.kind !== "ready" || state.data.detail.status !== "review_pending" || decisionState.kind === "pending") return;
    setDecisionState({ kind: "pending", action });
    try {
      await submitReviewDecision(id, action, state.data.publish, requester);
      if (current !== generation.current) return;
      const status = action === "publish" ? "published" : action === "reject" ? "rejected" : "revision_requested";
      setState({ kind: "ready", data: { ...state.data, detail: Object.freeze({ ...state.data.detail, status }) } });
      setDecisionState({ kind: "success", action });
    } catch {
      if (current === generation.current) setDecisionState({ kind: "error", action, message: frontendText(locale, "ADMIN_REVIEW_ACTION_ERROR") });
    }
  };

  const pageState: ReviewDetailState = state.kind === "ready" ? { kind: "ready", detail: state.data.detail } : state;
  return <ReviewDetailPage locale={locale} state={pageState} decisionState={decisionState} onDecision={(action) => { void decide(action); }} />;
}
