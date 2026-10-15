import { useEffect, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { DataTable, type DataTablePage } from "../components/data-table";
import { Input } from "../components/ui/input";
import { PageState } from "../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { writeSubmissionRange, type MySubmissionItem, type SubmissionRangeQuery } from "../lib/my-submissions-data";
import type { SupportedPageSize } from "../lib/numbered-page";
import { readWorkspaceLocation, writeWorkspaceHistory } from "../lib/workspace-location";

const unfilteredRange: SubmissionRangeQuery = { from: "", to: "", invalid: false };

export function MySubmissionsPage({ state, locale, pending = false, localError, range = unfilteredRange, pagination, onRetry, onLoadMore, onPageChange, onPageSizeChange }: {
  state: { kind: "loading" } | { kind: "ready"; items: readonly MySubmissionItem[]; pagination: { page: number; pageSize: SupportedPageSize; total: number; totalPages: number } } | { kind: "error"; message: string };
  locale: LocaleRuntime;
  pending?: boolean;
  localError?: string;
  /** Submission-time filter stated by the location; an empty interval is never listed. */
  range?: SubmissionRangeQuery;
  /** Route-held page metadata; the loaded page supplies it when the route does not. */
  pagination?: DataTablePage;
  onRetry?: () => void;
  onLoadMore?: () => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: SupportedPageSize) => void;
}) {
  if (!range.invalid && state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (!range.invalid && state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "COMMON_UNABLE_TO_LOAD")}>{onRetry && <Button type="button" variant="outline" size="sm" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button>}</PageState>;
  const ready = state.kind === "ready" ? state : undefined;
  const statusLabel = (item: MySubmissionItem) => item.status === "needs_revision" ? frontendText(locale, "SUBMISSIONS_NEEDS_REVISION") : item.status || frontendText(locale, "SUBMISSIONS_STATUS_UNAVAILABLE");
  return <section className="flex flex-col space-y-5 lg:h-full lg:min-h-0">
    <div><h1 className="text-2xl font-semibold">{frontendText(locale, "SUBMISSIONS_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "SUBMISSIONS_DESCRIPTION")}</p></div>
    <SubmissionRangeFilter locale={locale} range={range} pending={pending} />
    {localError && !range.invalid && <div role="alert" className="flex items-center gap-3 text-sm text-destructive"><span>{localError}</span><Button type="button" variant="outline" size="sm" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button></div>}
    {ready && !range.invalid && <DataTable
      locale={locale}
      rows={ready.items}
      columns={[
        { key: "item", header: frontendText(locale, "SUBMISSIONS_COLUMN_ITEM"), cell: (item) => <div className="py-1"><p className="font-medium">{item.title?.trim() || frontendText(locale, "SUBMISSIONS_UNTITLED")}</p><p className="mt-1 text-xs text-muted-foreground">{item.id}</p></div> },
        { key: "status", header: frontendText(locale, "SUBMISSIONS_COLUMN_STATUS"), width: "200px", cell: (item) => <div className="flex items-center gap-3"><Badge variant={item.status === "needs_revision" ? "warning" : "outline"}>{statusLabel(item)}</Badge>{item.status === "needs_revision" && <button type="button" className="text-sm font-medium text-primary hover:underline">{frontendText(locale, "SUBMISSIONS_RESUBMIT")}</button>}</div> },
        { key: "review", header: frontendText(locale, "SUBMISSIONS_COLUMN_REVIEW"), width: "40%", cellClassName: "whitespace-normal", cell: (item) => {
          if (!item.review) return null;
          const note = item.review.note.trim();
          return <div role="note" className="space-y-1 py-1"><p className="text-sm"><span className="font-medium">{frontendText(locale, "SUBMISSIONS_REVIEW_REASON")}：</span>{frontendText(locale, reviewReasonKey(item.review.reasonCode))}</p>{note && <p className="line-clamp-1 text-sm text-muted-foreground"><span className="font-medium">{frontendText(locale, "SUBMISSIONS_REVIEW_NOTE")}：</span>{note}</p>}</div>;
        } },
      ]}
      rowId={(item) => item.id}
      ariaLabel={frontendText(locale, "SUBMISSIONS_TITLE")}
      emptyState={<PageState kind="empty" title={frontendText(locale, "SUBMISSIONS_EMPTY")} />}
      loading={pending}
      pagination={pagination}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      hasMore={!localError && ready.pagination.page < ready.pagination.totalPages}
      onLoadMore={onLoadMore}
      rowHeight={88}
      fill
      className="lg:min-h-0 lg:flex-1"
    />}
  </section>;
}

/**
 * Date inputs plus Apply, mirroring the calendar range filter. Applying rewrites
 * the location, which is what keeps the range shareable and the route reloadable;
 * an empty interval disables Apply and reports it inline instead.
 */
function SubmissionRangeFilter({ locale, range, pending }: { locale: LocaleRuntime; range: SubmissionRangeQuery; pending: boolean }) {
  const [from, setFrom] = useState(() => dateFieldValue(range.from));
  const [to, setTo] = useState(() => dateFieldValue(range.to));
  // An applied filter (including one restored by history) wins over a stale draft.
  useEffect(() => { setFrom(dateFieldValue(range.from)); setTo(dateFieldValue(range.to)); }, [range.from, range.to]);
  const invalid = (!!from && !!to && from > to) || range.invalid;
  return <div data-submissions-range-filter className="space-y-2 rounded-lg border p-4">
    <p className="text-sm text-muted-foreground">{frontendText(locale, "SUBMISSIONS_RANGE_HINT")}</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm">{frontendText(locale, "CALENDAR_RANGE_FROM")}<Input aria-label={frontendText(locale, "CALENDAR_RANGE_FROM")} type="date" value={from} disabled={pending} onChange={(event) => setFrom(event.currentTarget.value)} /></label>
      <label className="space-y-1 text-sm">{frontendText(locale, "CALENDAR_RANGE_TO")}<Input aria-label={frontendText(locale, "CALENDAR_RANGE_TO")} type="date" value={to} disabled={pending} onChange={(event) => setTo(event.currentTarget.value)} /></label>
      <Button type="button" disabled={pending || invalid} onClick={() => { if (invalid) return; const { pathname, search } = readWorkspaceLocation(); writeWorkspaceHistory("push", `${pathname}${writeSubmissionRange(search, { from, to })}`); }}>{frontendText(locale, "CALENDAR_RANGE_APPLY")}</Button>
    </div>
    {invalid && <p role="alert" data-submissions-range-error className="text-sm text-destructive">{frontendText(locale, "SUBMISSIONS_RANGE_INVALID")}</p>}
  </div>;
}

/** A stated instant is shown by its UTC day, which is the granularity of the input. */
function dateFieldValue(value: string): string { return value ? value.slice(0, 10) : ""; }

function reviewReasonKey(reasonCode: NonNullable<MySubmissionItem["review"]>["reasonCode"]): string {
  switch (reasonCode) {
    case "not_relevant": return "SUBMISSIONS_REASON_NOT_RELEVANT";
    case "duplicate": return "SUBMISSIONS_REASON_DUPLICATE";
    case "unsafe": return "SUBMISSIONS_REASON_UNSAFE";
    case "needs_revision": return "SUBMISSIONS_REASON_NEEDS_REVISION";
  }
}
