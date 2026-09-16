import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { DataPagination } from "../../components/data-pagination";
import type { ReviewQueuePageResult } from "../../lib/admin-review-data";
import type { SupportedPageSize } from "../../lib/numbered-page";
import type { ReviewDecision, ReviewNoteInput } from "../../components/review/review-detail-data";
import { ReviewDecisionControls, ReviewDecisionFeedback, reviewDecisionLocked, type ReviewDecisionState } from "../../components/review/review-decision-controls";

export function ReviewQueuePage({ state, onReview, onRetry, onRetryDecision, onReloadDecision, onOpenDetail, pendingId, completedId, decisionState = { kind: "idle" }, localError, pending, onPageChange, onPageSizeChange, locale }: {
  state: { kind: "loading" } | { kind: "ready"; data: ReviewQueuePageResult } | { kind: "error" | "forbidden"; message: string };
  onRetry?: () => void; onRetryDecision?: () => void; onReloadDecision?: () => void; onOpenDetail?: (id: string) => void;
  onReview?: (id: string, action: ReviewDecision, details?: ReviewNoteInput) => void;
  pendingId?: string | null; completedId?: string | null; decisionState?: ReviewDecisionState; localError?: string; pending?: boolean;
  onPageChange?: (page: number) => void; onPageSizeChange?: (size: SupportedPageSize) => void; locale: LocaleRuntime;
}) {
  const retry = <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>;
  if (state.kind === "loading") return <div aria-busy="true"><Skeleton className="h-24" /></div>;
  if (state.kind !== "ready") return <PageState kind={state.kind} title={state.message || frontendText(locale, "COMMON_UNABLE_TO_LOAD")}>{retry}</PageState>;
  const locked = reviewDecisionLocked(decisionState);
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-semibold">{frontendText(locale, "ADMIN_REVIEW_QUEUE_TITLE")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_QUEUE_DESCRIPTION")}</p>
    </div>
    <ReviewDecisionFeedback state={decisionState} locale={locale} onRetry={onRetryDecision} onReload={onReloadDecision} />
    {localError && <><p role="alert" className="text-sm text-destructive">{localError}</p>{retry}</>}
    {state.data.items.length ? state.data.items.map((item) => {
      const disabled = Boolean(pending || pendingId || localError || locked);
      const target = item.title?.trim() || item.id;
      return <Card key={item.id}><CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-4"><div><h2 className="font-medium">
          <a href={`/admin/submissions/${encodeURIComponent(item.id)}`} onClick={(event) => {
            if (!onOpenDetail || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault(); onOpenDetail(item.id);
          }} className="hover:underline">{item.title?.trim() || frontendText(locale, "ADMIN_REVIEW_UNTITLED")}</a>
        </h2><p className="mt-1 text-xs text-muted-foreground">{item.submitter || frontendText(locale, "ADMIN_REVIEW_SUBMITTER_UNAVAILABLE")}</p></div>
          <Badge variant="outline">{item.status || frontendText(locale, "ADMIN_REVIEW_STATUS_UNAVAILABLE")}</Badge>
        </div>
        <ReviewDecisionControls disabled={disabled} terminal={completedId === item.id || Boolean(item.status && item.status !== "review_pending")}
          pendingAction={pendingId === item.id && decisionState.kind === "pending" ? decisionState.action : undefined}
          targetLabel={target} locale={locale} onDecision={(action, details) => onReview?.(item.id, action, details)} />
      </CardContent></Card>;
    }) : <PageState kind="empty" title={frontendText(locale, "ADMIN_REVIEW_EMPTY")} description={frontendText(locale, "ADMIN_REVIEW_QUEUE_DESCRIPTION")} />}
    <DataPagination {...state.data.pagination} locale={locale} pending={pending || Boolean(pendingId) || locked}
      onPageChange={(page) => onPageChange?.(page)} onPageSizeChange={(size) => onPageSizeChange?.(size)} />
  </section>;
}
