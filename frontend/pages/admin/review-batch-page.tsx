import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/ui/page-header";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { Checkbox } from "../../components/ui/checkbox";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { loadReviewQueuePage, type ReviewQueueItem, type ReviewQueuePageResult } from "../../lib/admin-review-data";
import type { Fetcher } from "../../lib/api";
import { ReviewBatchResults, ReviewBatchToolbar, useReviewBatch } from "../../components/review/review-batch-owner";
import type { BatchReviewItemOutcome } from "../../lib/admin-batch-review-data";

const PAGE_SIZE = 20;

type QueueState = { kind: "loading" } | { kind: "ready"; data: ReviewQueuePageResult } | { kind: "error" | "forbidden"; message: string };

/**
 * Dedicated batch-review surface. The queue page links here from its top-right
 * action; the batch itself never mixes with single-item decisions. Selection is
 * limited to this page (the same `useReviewBatch` scope statement the inline
 * surface used), and a fully successful submit returns to the queue. Partial
 * failures stay here with per-item outcomes so only the failures can be retried.
 */
export function ReviewBatchPage({ locale, memberId, canReview = true, load = loadReviewQueuePage, onBack, onComplete, requester = fetch }: {
  locale: LocaleRuntime;
  memberId?: string;
  canReview?: boolean;
  load?: typeof loadReviewQueuePage;
  onBack?: () => void;
  /** Called after every selected item committed; the route navigates back to the queue. */
  onComplete?: () => void;
  requester?: Fetcher;
}) {
  const [state, setState] = useState<QueueState>({ kind: "loading" });
  const [retry, setRetry] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    setState({ kind: "loading" });
    load({ page: 1, pageSize: PAGE_SIZE, requester, signal: controller.signal })
      .then((data) => { if (alive.current && !controller.signal.aborted) setState({ kind: "ready", data }); })
      .catch((error: unknown) => {
        if (!alive.current || controller.signal.aborted) return;
        const status = error && typeof error === "object" && "status" in error ? Number((error as { status: unknown }).status) : 0;
        setState(status === 403 ? { kind: "forbidden", message: frontendText(locale, "ADMIN_REVIEW_FORBIDDEN") } : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
      });
    return () => { alive.current = false; controller.abort(); };
  }, [load, locale, requester, retry]);

  const settled = useCallback((outcomes: readonly BatchReviewItemOutcome[]) => {
    if (outcomes.length > 0 && outcomes.every((outcome) => outcome.status === "succeeded")) onComplete?.();
  }, [onComplete]);

  const rows = state.kind === "ready" ? state.data.items : [];
  const batch = useReviewBatch({ items: rows, memberId, locale, enabled: canReview && state.kind === "ready", requester, onSettled: settled });
  const allSelected = rows.length > 0 && rows.every((row) => batch.selected.has(row.id));

  const columns: DataTableColumn<ReviewQueueItem>[] = [
    {
      key: "select",
      width: "64px",
      header: <span className="flex items-center gap-2">
        <Checkbox data-batch-select-all-header checked={allSelected} disabled={batch.freeze || rows.length === 0}
          aria-label={frontendText(locale, "ADMIN_REVIEW_BATCH_SELECT_ALL")} onCheckedChange={() => allSelected ? batch.clear() : batch.selectAllPage()} />
        <span>{frontendText(locale, "ADMIN_REVIEW_BATCH_SELECT")}</span>
      </span>,
      cell: (row) => <Checkbox data-batch-select={row.id} checked={batch.selected.has(row.id)} disabled={batch.freeze}
        aria-label={`${frontendText(locale, "ADMIN_REVIEW_BATCH_SELECT")}: ${row.title?.trim() || row.id}`} onCheckedChange={() => batch.toggle(row.id)} />,
    },
    { key: "item", header: frontendText(locale, "ADMIN_REVIEW_COLUMN_ITEM"), cellClassName: "whitespace-normal", cell: (row) => <div className="py-1">
      <p className="font-medium">{row.title?.trim() || frontendText(locale, "ADMIN_REVIEW_UNTITLED")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{row.submitter || frontendText(locale, "ADMIN_REVIEW_SUBMITTER_UNAVAILABLE")}</p>
    </div> },
    { key: "status", header: frontendText(locale, "ADMIN_REVIEW_COLUMN_STATUS"), width: "180px", cell: (row) => <Badge variant="outline">{row.status || frontendText(locale, "ADMIN_REVIEW_STATUS_UNAVAILABLE")}</Badge> },
  ];

  return <section className="flex flex-col gap-5 lg:h-full lg:min-h-0">
    <PageHeader title={frontendText(locale, "ADMIN_REVIEW_BATCH_PAGE_TITLE")} description={frontendText(locale, "ADMIN_REVIEW_BATCH_PAGE_DESCRIPTION")}
      actions={onBack && <Button type="button" variant="outline" data-review-batch-back onClick={onBack}>{frontendText(locale, "ADMIN_REVIEW_BATCH_BACK")}</Button>} />
    {!canReview ? <PageState kind="forbidden" title={frontendText(locale, "ADMIN_REVIEW_FORBIDDEN")} />
      : state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
      : state.kind !== "ready" ? <PageState kind={state.kind === "forbidden" ? "forbidden" : "error"} title={state.message} description={frontendText(locale, "COMMON_UNABLE_TO_LOAD")}>
        <Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>{frontendText(locale, "COMMON_RETRY")}</Button>
      </PageState>
      : <>
        <ReviewBatchToolbar batch={batch} rows={rows} page={state.data.pagination.page} pageSize={state.data.pagination.pageSize} locale={locale} />
        <DataTable
          locale={locale}
          rows={state.data.items}
          rowId={(row) => row.id}
          ariaLabel={frontendText(locale, "ADMIN_REVIEW_BATCH_PAGE_TITLE")}
          emptyState={<PageState kind="empty" title={frontendText(locale, "ADMIN_REVIEW_EMPTY")} description={frontendText(locale, "ADMIN_REVIEW_QUEUE_DESCRIPTION")} />}
          loading={batch.state.kind === "pending"}
          fill
          rowHeight={88}
          className="lg:min-h-0 lg:flex-1"
          columns={columns}
        />
        <ReviewBatchResults state={batch.state} locale={locale} onRetryFailed={batch.retryFailed} />
      </>}
  </section>;
}
