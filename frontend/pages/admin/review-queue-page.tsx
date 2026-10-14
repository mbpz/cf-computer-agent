import { useRef } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { DataTable } from "../../components/data-table";
import { Skeleton } from "../../components/ui/skeleton";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { ReviewQueuePageResult } from "../../lib/admin-review-data";
import type { ReviewDecision, ReviewNoteInput } from "../../components/review/review-detail-data";
import { ReviewDecisionControls, ReviewDecisionFeedback, reviewDecisionLocked, type ReviewDecisionState } from "../../components/review/review-decision-controls";

export function ReviewQueuePage({ state, onReview, onRetry, onRetryDecision, onReloadDecision, onOpenDetail, pendingId, completedId, decisionState = { kind: "idle" }, localError, pending, onLoadMore, locale, decisionRecordBlocked = false, onDiscardDecisionRecord }: {
  state: { kind: "loading" } | { kind: "ready"; data: ReviewQueuePageResult } | { kind: "error" | "forbidden"; message: string };
  onRetry?: () => void; onRetryDecision?: () => void; onReloadDecision?: () => void; onOpenDetail?: (id: string) => void;
  onReview?: (id: string, action: ReviewDecision, details?: ReviewNoteInput) => void;
  pendingId?: string | null; completedId?: string | null; decisionState?: ReviewDecisionState; localError?: string; pending?: boolean;
  onLoadMore?: () => void; locale: LocaleRuntime;
  decisionRecordBlocked?: boolean; onDiscardDecisionRecord?: () => void;
}) {
  const confirmationLock = useRef<object | null>(null);
  const retry = <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>;
  if (state.kind === "loading") return <div aria-busy="true"><Skeleton className="h-24" /></div>;
  if (state.kind !== "ready") return <PageState kind={state.kind} title={state.message || frontendText(locale, "COMMON_UNABLE_TO_LOAD")}>{retry}</PageState>;
  const locked = reviewDecisionLocked(decisionState);
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-semibold">{frontendText(locale, "ADMIN_REVIEW_QUEUE_TITLE")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_QUEUE_DESCRIPTION")}</p>
    </div>
    {decisionRecordBlocked && <div role="alert" data-review-decision-record-blocked className="space-y-2 text-sm text-destructive"><p>{frontendText(locale, "ADMIN_REVIEW_DECISION_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={onDiscardDecisionRecord}>{frontendText(locale, "ADMIN_REVIEW_DECISION_RECORD_DISCARD")}</Button></div>}
    <ReviewDecisionFeedback allowUnknownReload state={decisionState} locale={locale} onRetry={onRetryDecision} onReload={onReloadDecision} />
    {localError && <><p role="alert" className="text-sm text-destructive">{localError}</p>{retry}</>}
    <DataTable
      locale={locale}
      rows={state.data.items}
      rowId={(item) => item.id}
      ariaLabel={frontendText(locale, "ADMIN_REVIEW_QUEUE_TITLE")}
      emptyState={<PageState kind="empty" title={frontendText(locale, "ADMIN_REVIEW_EMPTY")} description={frontendText(locale, "ADMIN_REVIEW_QUEUE_DESCRIPTION")} />}
      loading={pending}
      hasMore={!localError && state.data.pagination.page < state.data.pagination.totalPages}
      onLoadMore={onLoadMore}
      rowHeight={104}
      columns={[
        { key: "item", header: frontendText(locale, "ADMIN_REVIEW_COLUMN_ITEM"), cellClassName: "whitespace-normal", cell: (item) => <div className="py-1">
          <p className="font-medium">
            <a href={`/admin/submissions/${encodeURIComponent(item.id)}`} onClick={(event) => {
              if (!onOpenDetail || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault(); onOpenDetail(item.id);
            }} className="hover:underline">{item.title?.trim() || frontendText(locale, "ADMIN_REVIEW_UNTITLED")}</a>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{item.submitter || frontendText(locale, "ADMIN_REVIEW_SUBMITTER_UNAVAILABLE")}</p>
        </div> },
        { key: "status", header: frontendText(locale, "ADMIN_REVIEW_COLUMN_STATUS"), width: "180px", cellClassName: "whitespace-normal", cell: (item) => <Badge variant="outline">{item.status || frontendText(locale, "ADMIN_REVIEW_STATUS_UNAVAILABLE")}</Badge> },
        { key: "actions", header: frontendText(locale, "ADMIN_REVIEW_COLUMN_ACTIONS"), width: "420px", cellClassName: "whitespace-normal", cell: (item) => {
          const target = item.title?.trim() || item.id;
          const disabled = Boolean(pending || pendingId || localError || locked);
          return <ReviewDecisionControls decisionUnresolved={locked} confirmationLock={confirmationLock} disabled={disabled} terminal={completedId === item.id || Boolean(item.status && item.status !== "review_pending")}
            pendingAction={pendingId === item.id && decisionState.kind === "pending" ? decisionState.action : undefined}
            targetId={item.id} snapshot={state.data} targetLabel={target} locale={locale} onDecision={onReview ? (action, details) => onReview(item.id, action, details) : undefined} />;
        } },
      ]}
    />
  </section>;
}
