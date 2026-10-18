import { useEffect, useState } from "react";
import { Files } from "@phosphor-icons/react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ButtonLink } from "../components/motion/button/base";
import { DataTable, type DataTablePage } from "../components/data-table";
import { DateRangeInput, type DayRange } from "../components/ui/date-range-input";
import { AppliedFilters, type AppliedFilter } from "../components/ui/applied-filters";
import { OverflowActions } from "../components/motion/overflow-actions";
import { PageHeader } from "../components/ui/page-header";
import { PageState } from "../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import { submissionResubmitSource, writeSubmissionRange, type MySubmissionItem, type SubmissionRangeQuery } from "../lib/my-submissions-data";
import type { SupportedPageSize } from "../lib/numbered-page";
import { readWorkspaceLocation, writeWorkspaceHistory } from "../lib/workspace-location";

const unfilteredRange: SubmissionRangeQuery = { from: "", to: "", invalid: false };

export function MySubmissionsPage({ state, locale, pending = false, localError, resubmitError, resubmitted, range = unfilteredRange, pagination, onRetry, onResubmit, onLoadMore, onPageChange, onPageSizeChange }: {
  state: { kind: "loading" } | { kind: "ready"; items: readonly MySubmissionItem[]; pagination: { page: number; pageSize: SupportedPageSize; total: number; totalPages: number } } | { kind: "error"; message: string };
  locale: LocaleRuntime;
  pending?: boolean;
  localError?: string;
  /** Reported when a returned item cannot be opened for resubmission. */
  resubmitError?: string;
  /** Rows whose resubmission already exists, read from the server's own supersede link. */
  resubmitted?: readonly { priorId: string; submissionId: string }[];
  /** Submission-time filter stated by the location; an empty interval is never listed. */
  range?: SubmissionRangeQuery;
  /** Route-held page metadata; the loaded page supplies it when the route does not. */
  pagination?: DataTablePage;
  onRetry?: () => void;
  /** Opens a returned item in the resubmission editor. */
  onResubmit?: (item: MySubmissionItem) => void;
  onLoadMore?: () => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: SupportedPageSize) => void;
}) {
  const ready = state.kind === "ready" ? state : undefined;
  const statusLabel = (item: MySubmissionItem) => item.status === "needs_revision" ? frontendText(locale, "SUBMISSIONS_NEEDS_REVISION") : item.status || frontendText(locale, "SUBMISSIONS_STATUS_UNAVAILABLE");
  // The stated range stays visible as removable text; the header and the range control
  // remain mounted on every read state, so only the content slot follows the request.
  const appliedRange: AppliedFilter[] = range.invalid ? [] : [
    ...(range.from ? [{ id: "from", label: `${frontendText(locale, "CALENDAR_RANGE_FROM")}: ${dateFieldValue(range.from)}`, onRemove: () => applyRange({ from: "", to: range.to }) }] : []),
    ...(range.to ? [{ id: "to", label: `${frontendText(locale, "CALENDAR_RANGE_TO")}: ${dateFieldValue(range.to)}`, onRemove: () => applyRange({ from: range.from, to: "" }) }] : []),
  ];
  // The composer owns no sidebar entry (migrations/0075 hides it), so the page
  // header's primary action is the entry point to `/submit`. Its link text is the
  // composer's own title (the accessible name), and it carries the app button's
  // keyboard ring plus a 44px mobile target.
  return <section className="flex flex-col space-y-5 lg:h-full lg:min-h-0">
    <PageHeader
      title={frontendText(locale, "SUBMISSIONS_TITLE")}
      description={frontendText(locale, "SUBMISSIONS_DESCRIPTION")}
      icon={<Files size={22} weight="duotone" className="text-primary" />}
      actions={<ButtonLink
        data-my-submissions-submit
        href="/submit"
        variant="primary"
        size="md"
        className="max-lg:h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={(event) => { event.preventDefault(); writeWorkspaceHistory("push", "/submit"); }}
      >{frontendText(locale, "SUBMIT_TITLE")}</ButtonLink>}
    />
    <SubmissionRangeFilter locale={locale} range={range} pending={pending} />
    {!range.invalid && <AppliedFilters ariaLabel={frontendText(locale, "COMMON_APPLIED_FILTERS")} clearLabel={frontendText(locale, "COMMON_CLEAR_FILTERS")} filters={appliedRange} onClear={() => applyRange({ from: "", to: "" })} />}
    {range.invalid ? null
      : state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
      : state.kind === "error" ? <PageState kind="error" title={state.message || frontendText(locale, "COMMON_UNABLE_TO_LOAD")}>{onRetry && <Button type="button" variant="outline" size="sm" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button>}</PageState>
      : <>{localError && <div role="alert" className="flex items-center gap-3 text-sm text-destructive"><span>{localError}</span><Button type="button" variant="outline" size="sm" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button></div>}
    {resubmitError && <div role="alert" data-my-submissions-resubmit-error className="text-sm text-destructive">{resubmitError}</div>}
    {ready && <DataTable
      locale={locale}
      rows={ready.items}
      columns={[
        { key: "item", header: frontendText(locale, "SUBMISSIONS_COLUMN_ITEM"), cell: (item) => <div className="py-1"><p className="font-medium">{item.title?.trim() || frontendText(locale, "SUBMISSIONS_UNTITLED")}</p><p className="mt-1 text-xs text-muted-foreground">{item.id}</p></div> },
        { key: "status", header: frontendText(locale, "SUBMISSIONS_COLUMN_STATUS"), width: "240px", cell: (item) => <div className="flex flex-wrap items-center gap-3"><Badge variant={item.status === "revision_requested" ? "warning" : "outline"}>{statusLabel(item)}</Badge>{resubmitAction(item, locale, onResubmit, resubmitted)}</div> },
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
    />}</>}
  </section>;
}

/**
 * Rewrites the location with the requested submission range so the range stays
 * shareable and the route re-reads it; the status filter and page size survive.
 */
function applyRange(next: { from: string; to: string }): void {
  const { pathname, search } = readWorkspaceLocation();
  writeWorkspaceHistory("push", `${pathname}${writeSubmissionRange(search, next)}`);
}

/**
 * Date inputs plus Apply, mirroring the calendar range filter. Applying rewrites
 * the location, which is what keeps the range shareable and the route reloadable;
 * an empty interval disables Apply and reports it inline instead.
 */
function SubmissionRangeFilter({ locale, range, pending }: { locale: LocaleRuntime; range: SubmissionRangeQuery; pending: boolean }) {
  const [draft, setDraft] = useState<DayRange>(() => submissionRangeDraft(range));
  // An applied filter (including one restored by history) wins over a stale draft.
  useEffect(() => { setDraft(submissionRangeDraft(range)); }, [range.from, range.to]);
  const invalid = (!!draft.from && !!draft.to && draft.from > draft.to) || range.invalid;
  const start = frontendText(locale, "CALENDAR_RANGE_FROM");
  const end = frontendText(locale, "CALENDAR_RANGE_TO");
  return <div data-submissions-range-filter className="space-y-2 rounded-lg border p-4">
    <p className="text-sm text-muted-foreground">{frontendText(locale, "SUBMISSIONS_RANGE_HINT")}</p>
    <div className="flex flex-wrap items-end gap-3">
      <DateRangeInput
        value={draft}
        onChange={setDraft}
        locale={locale?.locale ?? "en"}
        disabled={pending}
        texts={{ label: `${start} – ${end}`, placeholder: `${start} – ${end}`, start, end, clear: frontendText(locale, "COMMON_CLEAR_FILTERS") }}
      />
      <Button type="button" disabled={pending || invalid} onClick={() => { if (invalid) return; applyRange(draft); }}>{frontendText(locale, "CALENDAR_RANGE_APPLY")}</Button>
    </div>
    {invalid && <p role="alert" data-submissions-range-error className="text-sm text-destructive">{frontendText(locale, "SUBMISSIONS_RANGE_INVALID")}</p>}
  </div>;
}

/** The applied bounds as the day values the range control edits. */
function submissionRangeDraft(range: SubmissionRangeQuery): DayRange {
  return { from: dateFieldValue(range.from), to: dateFieldValue(range.to) };
}

/** A stated instant is shown by its UTC day, which is the granularity of the input. */
function dateFieldValue(value: string): string { return value ? value.slice(0, 10) : ""; }

/**
 * The row action for a returned item: offered only while the row is
 * `revision_requested` and its own source is readable, replaced by the server's
 * supersede link once the member has resubmitted it, and never rendered as a
 * control that would send nothing.
 */
function resubmitAction(item: MySubmissionItem, locale: LocaleRuntime, onResubmit?: (item: MySubmissionItem) => void, resubmitted?: readonly { priorId: string; submissionId: string }[]) {
  const mark = resubmitted?.find((candidate) => candidate.priorId === item.id);
  if (mark) return <span data-my-submission-resubmitted className="text-xs text-muted-foreground">{frontendText(locale, "SUBMISSIONS_ALREADY_RESUBMITTED")} {mark.submissionId}</span>;
  if (item.status !== "revision_requested") return null;
  if (!onResubmit || !submissionResubmitSource(item)) return <span data-my-submission-resubmit-unavailable className="text-xs text-muted-foreground">{frontendText(locale, "SUBMISSIONS_RESUBMIT_UNAVAILABLE")}</span>;
  return <OverflowActions size="sm" primaryActions={[{
    id: "resubmit",
    label: frontendText(locale, "SUBMISSIONS_RESUBMIT"),
    attributes: { "data-my-submission-resubmit": true },
    onClick: () => onResubmit(item),
  }]} openLabel={frontendText(locale, "COMMON_MORE_ACTIONS")} closeLabel={frontendText(locale, "COMMON_FEWER_ACTIONS")} />;
}

function reviewReasonKey(reasonCode: NonNullable<MySubmissionItem["review"]>["reasonCode"]): string {
  switch (reasonCode) {
    case "not_relevant": return "SUBMISSIONS_REASON_NOT_RELEVANT";
    case "duplicate": return "SUBMISSIONS_REASON_DUPLICATE";
    case "unsafe": return "SUBMISSIONS_REASON_UNSAFE";
    case "needs_revision": return "SUBMISSIONS_REASON_NEEDS_REVISION";
  }
}
