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
import type { SupportedPageSize } from "../../lib/numbered-page";
import { readWorkspaceLocation } from "../../lib/workspace-location";

const DEFAULT_PAGE_SIZE: SupportedPageSize = 20;
function batchPage(search: string): { page: number; pageSize: SupportedPageSize } {
  const params = new URLSearchParams(search);
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("pageSize"));
  return {
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: pageSize === 20 || pageSize === 50 || pageSize === 100 ? pageSize : DEFAULT_PAGE_SIZE,
  };
}

type QueueState = { kind: "loading" } | { kind: "ready"; data: ReviewQueuePageResult } | { kind: "error" | "forbidden"; message: string };

/**
 * Dedicated batch-review surface. The queue page links here from its top-right
 * action; the batch itself never mixes with single-item decisions. Selection is
 * limited to this page (the same `useReviewBatch` scope statement the inline
 * surface used), and a fully successful submit returns to the queue. Partial
 * failures stay here with per-item outcomes so only the failures can be retried.
 */
export function ReviewBatchPage({ locale, memberId, canReview = true, search = "", load = loadReviewQueuePage, onBack, onComplete, requester = fetch }: {
  locale: LocaleRuntime;
  search?: string;
  memberId?: string;
  canReview?: boolean;
  load?: typeof loadReviewQueuePage;
  onBack?: () => void;
  /** Called after every selected item committed; the route navigates back to the queue. */
  onComplete?: () => void;
  requester?: Fetcher;
}) {
  const initial = batchPage(search);
  const [page, setPage] = useState(initial.page);
  const [pageSize, setPageSize] = useState<SupportedPageSize>(initial.pageSize);
  const [state, setState] = useState<QueueState>({ kind: "loading" });
  const [retry, setRetry] = useState(0);
  const alive = useRef(true);
  const mounted = useRef(true);
  const pendingPage = useRef<number | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    setState({ kind: "loading" });
    load({ page, pageSize, requester, signal: controller.signal })
      .then((data) => { if (alive.current && !controller.signal.aborted) setState({ kind: "ready", data }); })
      .catch((error: unknown) => {
        if (!alive.current || controller.signal.aborted) return;
        const status = error && typeof error === "object" && "status" in error ? Number((error as { status: unknown }).status) : 0;
        setState(status === 403 ? { kind: "forbidden", message: frontendText(locale, "ADMIN_REVIEW_FORBIDDEN") } : { kind: "error", message: frontendText(locale, "COMMON_UNABLE_TO_LOAD") });
      });
    return () => { alive.current = false; controller.abort(); };
  }, [load, locale, page, pageSize, requester, retry]);

  const started = useCallback(() => { pendingPage.current = page; }, [page]);
  const settled = useCallback((outcomes: readonly BatchReviewItemOutcome[]) => {
    if (!mounted.current || pendingPage.current !== page) return;
    pendingPage.current = null;
    if (readWorkspaceLocation().pathname !== "/admin/submissions/batch") return;
    if (outcomes.length > 0 && outcomes.every((outcome) => outcome.status === "succeeded")) onComplete?.();
  }, [onComplete, page]);

  const rows = state.kind === "ready" ? state.data.items : [];
  const batch = useReviewBatch({ items: rows, memberId, locale, enabled: canReview && state.kind === "ready", requester, onStart: started, onSettled: settled });
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
        {batch.state.kind === "unknown" && <div data-batch-unknown role="alert" className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium">{frontendText(locale, "ADMIN_REVIEW_BATCH_UNKNOWN_TITLE")}</p>
          <p className="text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_BATCH_UNKNOWN_DESCRIPTION")}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" data-batch-retry-original onClick={() => void batch.retryAttempts()}>{frontendText(locale, "ADMIN_REVIEW_BATCH_RETRY_ORIGINAL")}</Button>
            <Button type="button" size="sm" variant="outline" data-batch-discard-unknown onClick={batch.discardUnknown}>{frontendText(locale, "ADMIN_REVIEW_BATCH_DISCARD_UNKNOWN")}</Button>
          </div>
        </div>}
        <DataTable
          locale={locale}
          rows={state.data.items}
          rowId={(row) => row.id}
          ariaLabel={frontendText(locale, "ADMIN_REVIEW_BATCH_PAGE_TITLE")}
          emptyState={<PageState kind="empty" title={frontendText(locale, "ADMIN_REVIEW_EMPTY")} description={frontendText(locale, "ADMIN_REVIEW_QUEUE_DESCRIPTION")} />}
          loading={batch.state.kind === "pending"}
          pagination={state.data.pagination}
          onPageChange={(next) => { if (batch.freeze) return; batch.clear(); setPage(next); }}
          onPageSizeChange={(size) => { if (batch.freeze) return; batch.clear(); setPageSize(size); setPage(1); }}
          fill
          rowHeight={88}
          className="lg:min-h-0 lg:flex-1"
          columns={columns}
        />
        <ReviewBatchResults state={batch.state} locale={locale} onRetryFailed={batch.retryFailed} />
      </>}
  </section>;
}
