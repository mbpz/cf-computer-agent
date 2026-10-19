import { useRef } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/ui/page-header";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { ReviewQueueItem, ReviewQueuePageResult } from "../../lib/admin-review-data";
import type { SupportedPageSize } from "../../lib/numbered-page";
import type { ReviewDecision, ReviewNoteInput } from "../../components/review/review-detail-data";
import { ReviewDecisionControls, ReviewDecisionFeedback, reviewDecisionLocked, type ReviewDecisionState } from "../../components/review/review-decision-controls";

export function ReviewQueuePage({ state, onReview, onRetry, onRetryDecision, onReloadDecision, onOpenDetail, pendingId, completedId, decisionState = { kind: "idle" }, localError, pending, onPageChange, onPageSizeChange, onLoadMore, locale, decisionRecordBlocked = false, onDiscardDecisionRecord, canBatch = false, onOpenBatch }: {
  state: { kind: "loading" } | { kind: "ready"; data: ReviewQueuePageResult } | { kind: "error" | "forbidden"; message: string };
  onRetry?: () => void; onRetryDecision?: () => void; onReloadDecision?: () => void; onOpenDetail?: (id: string) => void;
  onReview?: (id: string, action: ReviewDecision, details?: ReviewNoteInput) => void;
  pendingId?: string | null; completedId?: string | null; decisionState?: ReviewDecisionState; localError?: string; pending?: boolean;
  onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: SupportedPageSize) => void;
  onLoadMore?: () => void; locale: LocaleRuntime;
  decisionRecordBlocked?: boolean; onDiscardDecisionRecord?: () => void;
  /** The batch page needs `knowledge:review`; the parent passes the real capability answer. An unstated capability never renders the entry. */
  canBatch?: boolean; onOpenBatch?: () => void;
}) {
  const confirmationLock = useRef<object | null>(null);
  const retry = <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onRetry}>{frontendText(locale, "COMMON_RETRY")}</Button>;
  const locked = reviewDecisionLocked(decisionState);
  // Batch decisions live on their own page; the queue only offers the entry.
  const readyData: ReviewQueuePageResult | undefined = state.kind === "ready" ? state.data : undefined;
  const columns: DataTableColumn<ReviewQueueItem>[] = [
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
        targetId={item.id} snapshot={readyData} targetLabel={target} locale={locale} onDecision={onReview ? (action, details) => onReview(item.id, action, details) : undefined} />;
    } },
  ];
  // The page shell is constant (research §4.3): the header renders for every state and
  // only the content slot switches between loading, failure and the queue itself.
  return <section className="flex flex-col gap-5 lg:h-full lg:min-h-0" aria-busy={state.kind === "loading" || undefined}>
    <PageHeader title={frontendText(locale, "ADMIN_REVIEW_QUEUE_TITLE")} description={frontendText(locale, "ADMIN_REVIEW_QUEUE_DESCRIPTION")}
      actions={canBatch && onOpenBatch ? <Button type="button" variant="outline" data-review-batch-open onClick={onOpenBatch}>{frontendText(locale, "ADMIN_REVIEW_BATCH_OPEN")}</Button> : undefined} />
    {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
      : state.kind !== "ready" ? <PageState kind={state.kind} title={state.message || frontendText(locale, "COMMON_UNABLE_TO_LOAD")}>{retry}</PageState>
      : <>
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
      pagination={state.data.pagination}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      hasMore={!localError && state.data.pagination.page < state.data.pagination.totalPages}
      onLoadMore={onLoadMore}
      fill
      className="lg:min-h-0 lg:flex-1"
      rowHeight={104}
      columns={columns}
    />
      </>}
  </section>;
}
