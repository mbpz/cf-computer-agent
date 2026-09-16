import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button, buttonVariants } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { ReviewDetailModel } from "../../components/review/review-detail-model";
import type { ReactNode } from "react";
import type { ReviewDecision, ReviewNoteInput } from "../../components/review/review-detail-data";
import { ReviewDecisionControls, ReviewDecisionFeedback, reviewDecisionLocked, type ReviewDecisionState } from "../../components/review/review-decision-controls";

export type { ReviewDecisionState } from "../../components/review/review-decision-controls";
export type ReviewDetailState = { kind: "loading" } | { kind: "ready"; detail: ReviewDetailModel } | { kind: "error" | "forbidden" | "not-found"; message: string };

export function ReviewDetailPage({ state, onDecision, onRetry, onRetryDecision, onBack, decisionState = { kind: "idle" }, locale, comments }: {
  state: ReviewDetailState; onDecision?: (action: ReviewDecision, details?: ReviewNoteInput) => void;
  onRetry?: () => void; onRetryDecision?: () => void; onBack?: () => void;
  decisionState?: ReviewDecisionState; locale?: LocaleRuntime; comments?: ReactNode;
}) {
  if (state.kind === "loading") return <div aria-busy="true" className="space-y-4"><Skeleton className="h-10" /><Skeleton className="h-64" /></div>;
  if (state.kind !== "ready") return <section className="space-y-4" data-page-state={state.kind}>
    <Alert variant={state.kind === "not-found" ? "default" : "destructive"}><AlertDescription>{state.message}
      <div className="flex flex-wrap gap-2">
        {state.kind !== "not-found" && onRetry && <Button variant="outline" onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>}
        <a className={buttonVariants({ variant: "outline" })} href="/admin/submissions" onClick={(event) => {
          if (!onBack || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); onBack();
        }}>{frontendText(locale, "ADMIN_REVIEW_BACK")}</a>
      </div>
    </AlertDescription></Alert>
  </section>;
  const { detail } = state;
  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-medium text-primary">{frontendText(locale, "ADMIN_REVIEW_DETAIL_LABEL")}</p>
        <h1 className="mt-1 text-2xl font-semibold">{detail.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_SUBMITTER")}: {detail.submitter}</p>
      </div><Badge variant="outline">{detail.status}</Badge>
    </div>
    <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_REVIEW_CONTENT")}</CardTitle></CardHeader><CardContent>
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-sm leading-7">{detail.content || frontendText(locale, "ADMIN_REVIEW_NO_CONTENT")}</pre>
    </CardContent></Card>
    {detail.warnings.length ? <Alert><AlertDescription><strong>{frontendText(locale, "ADMIN_REVIEW_WARNINGS")}:</strong> {detail.warnings.join(" · ")}</AlertDescription></Alert> : null}
    {comments}
    <ReviewDecisionFeedback state={decisionState} locale={locale} onRetry={onRetryDecision} onReload={onRetry} />
    <Card><CardHeader><CardTitle>{frontendText(locale, "ADMIN_REVIEW_DECISION")}</CardTitle></CardHeader><CardContent>
      <ReviewDecisionControls key={detail.id} disabled={reviewDecisionLocked(decisionState)} terminal={detail.status !== "review_pending"}
        pendingAction={decisionState.kind === "pending" ? decisionState.action : undefined} onDecision={onDecision} locale={locale} />
    </CardContent></Card>
  </section>;
}
