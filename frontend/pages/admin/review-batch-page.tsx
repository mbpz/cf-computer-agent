import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/ui/page-header";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { Checkbox } from "../../components/ui/checkbox";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { loadReviewQueuePage, type ReviewQueueItem, type ReviewQueuePageResult } from "../../lib/admin-review-data";
import { loadDecisionReceipt, mapWithConcurrency, type DecisionReceiptLookup } from "../../lib/admin-batch-review-data";
import { ApiRequestError, type Fetcher } from "../../lib/api";
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

type DecisionReceiptRow = DecisionReceiptLookup & { readonly status: "found" | "missing" | "unavailable" };

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
  const [receipts, setReceipts] = useState<readonly DecisionReceiptRow[] | null>(null);
  const [copiedReceipt, setCopiedReceipt] = useState<string | null>(null);
  const [receiptBatch, setReceiptBatch] = useState<string | null>(null);
  const liveBatchId = useRef<string | null>(null);
  const [checkingReceipts, setCheckingReceipts] = useState(false);
  const receiptAbort = useRef<AbortController | null>(null);
  const receiptScopeRef = useRef<string | null>(null);
  const receiptRound = useRef(0);
  const [receiptError, setReceiptError] = useState<string>();
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

  const checkReceipts = async (onlyUnavailable = false) => {
    const scope = receiptScope;
    if (batch.state.kind !== "unknown" || checkingReceipts || !scope) return;
    const targets = onlyUnavailable
      ? (receipts ?? []).filter((row) => row.status === "unavailable").map((row) => ({ submissionId: row.submissionId, operationId: row.operationId }))
      : [...batch.state.attempts];
    if (targets.length === 0) return;
    receiptAbort.current?.abort();
    const controller = new AbortController();
    receiptAbort.current = controller;
    const round = receiptRound.current + 1;
    receiptRound.current = round;
    setCheckingReceipts(true);
    setReceiptError(undefined);
    try {
      const results = await mapWithConcurrency(targets, 4, controller.signal, async (attempt): Promise<DecisionReceiptRow> => {
        try {
          const value = await loadDecisionReceipt(attempt.submissionId, attempt.operationId, requester, controller.signal);
          return { ...value, status: value.found ? "found" : "missing" };
        } catch (error) {
          if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) throw error;
          if (error instanceof DOMException && error.name === "AbortError") throw error;
          return { submissionId: attempt.submissionId, operationId: attempt.operationId, found: false, status: "unavailable" };
        }
      });
      if (mounted.current && receiptScopeRef.current === scope && receiptRound.current === round) {
        if (onlyUnavailable) {
          const byId = new Map(results.map((row) => [row.submissionId, row]));
          setReceipts((previous) => (previous ?? []).map((row) => byId.get(row.submissionId) ?? row));
        } else setReceipts(results);
        setReceiptBatch(scope);
      }
    } catch (error) {
      if (mounted.current && receiptScopeRef.current === scope && receiptRound.current === round && !(error instanceof DOMException && error.name === "AbortError")) {
        if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
          controller.abort();
          setReceipts(null);
          setReceiptBatch(null);
          setReceiptError(frontendText(locale, "ADMIN_REVIEW_BATCH_RECEIPT_FORBIDDEN"));
        } else setReceiptError(frontendText(locale, "COMMON_UNABLE_TO_LOAD"));
      }
    } finally {
      if (mounted.current && receiptScopeRef.current === scope && receiptRound.current === round) setCheckingReceipts(false);
    }
  };
  const copyReceiptOperation = async (operationId: string) => {
    try { await navigator.clipboard.writeText(operationId); if (mounted.current) setCopiedReceipt(operationId); }
    catch { if (mounted.current) setReceiptError(frontendText(locale, "ADMIN_REVIEW_BATCH_RECEIPT_COPY_FAILED")); }
  };
  const started = useCallback(() => { pendingPage.current = page; }, [page]);
  const settled = useCallback((outcomes: readonly BatchReviewItemOutcome[]) => {
    if (!mounted.current || pendingPage.current !== page) return;
    pendingPage.current = null;
    if (readWorkspaceLocation().pathname !== "/admin/submissions/batch") return;
    if (outcomes.length > 0 && outcomes.every((outcome) => outcome.status === "succeeded")) onComplete?.();
  }, [onComplete, page]);

  const rows = state.kind === "ready" ? state.data.items : [];
  const batch = useReviewBatch({ items: rows, memberId, locale, enabled: canReview && state.kind === "ready", requester, onStart: started, onSettled: settled });
  liveBatchId.current = batch.batchId;
  const receiptScope = batch.state.kind === "unknown"
    ? `${batch.batchId}|${batch.state.attempts.map((a) => `${a.submissionId}:${a.operationId}`).join(",")}`
    : null;
  useEffect(() => {
    if (receiptScopeRef.current === receiptScope) return;
    receiptScopeRef.current = receiptScope;
    receiptRound.current += 1;
    receiptAbort.current?.abort();
    receiptAbort.current = null;
    setReceipts(null); setReceiptBatch(null); setReceiptError(undefined); setCheckingReceipts(false); setCopiedReceipt(null);
  }, [receiptScope]);
  useEffect(() => () => { receiptAbort.current?.abort(); }, []);
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
            <Button type="button" size="sm" variant="outline" data-batch-check-receipts disabled={checkingReceipts} onClick={() => void checkReceipts()}>{checkingReceipts ? frontendText(locale, "ADMIN_REVIEW_BATCH_RECEIPT_CHECKING") : frontendText(locale, "ADMIN_REVIEW_BATCH_CHECK_RECEIPTS")}</Button>
            <Button type="button" size="sm" data-batch-retry-original onClick={() => void batch.retryAttempts()}>{frontendText(locale, "ADMIN_REVIEW_BATCH_RETRY_ORIGINAL")}</Button>
            <Button type="button" size="sm" variant="outline" data-batch-discard-unknown onClick={batch.discardUnknown}>{frontendText(locale, "ADMIN_REVIEW_BATCH_DISCARD_UNKNOWN")}</Button>
          </div>
          {receiptError && <p role="alert" className="text-destructive">{receiptError}</p>}
          {receipts && <div data-batch-receipt-batch={receiptBatch ?? ""} data-batch-receipt-check={`${receipts.filter((receipt) => receipt.status === "found").length}:${receipts.length}`} className="space-y-2 text-xs">
            <p className="font-medium">{frontendText(locale, "ADMIN_REVIEW_BATCH_RECEIPT_RESULT").replace("{found}", String(receipts.filter((receipt) => receipt.status === "found").length)).replace("{total}", String(receipts.length))}</p>
            <p className="text-muted-foreground">{frontendText(locale, "ADMIN_REVIEW_BATCH_RECEIPT_COUNTS").replace("{missing}", String(receipts.filter((receipt) => receipt.status === "missing").length)).replace("{unavailable}", String(receipts.filter((receipt) => receipt.status === "unavailable").length))}</p>
            <ul className="space-y-1">{receipts.map((receipt) => <li key={receipt.submissionId} data-batch-receipt-row={receipt.submissionId} data-batch-receipt-status={receipt.status} className="flex flex-wrap items-center gap-2">
              <span>{receipt.submissionId} · {receipt.operationId} · {frontendText(locale, receipt.status === "found" ? "ADMIN_REVIEW_BATCH_RECEIPT_FOUND" : receipt.status === "missing" ? "ADMIN_REVIEW_BATCH_RECEIPT_MISSING" : "ADMIN_REVIEW_BATCH_RECEIPT_UNAVAILABLE")}</span>
              <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" data-batch-receipt-copy={receipt.submissionId} onClick={() => void copyReceiptOperation(receipt.operationId)}>{frontendText(locale, copiedReceipt === receipt.operationId ? "ADMIN_REVIEW_BATCH_RECEIPT_COPIED" : "ADMIN_REVIEW_BATCH_RECEIPT_COPY")}</Button>
            </li>)}</ul>
            {receipts.some((receipt) => receipt.status === "unavailable") && <Button type="button" size="sm" variant="outline" data-batch-receipt-retry-unavailable disabled={checkingReceipts} onClick={() => void checkReceipts(true)}>{frontendText(locale, "ADMIN_REVIEW_BATCH_RECEIPT_RETRY_UNAVAILABLE")}</Button>}
          </div>}
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
