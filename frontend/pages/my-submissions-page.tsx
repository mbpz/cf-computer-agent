import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { DataTable } from "../components/data-table";
import { PageState } from "../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { MySubmissionItem } from "../lib/my-submissions-data";

export function MySubmissionsPage({ state, locale, pending = false, localError, onRetry, onLoadMore }: {
  state: { kind: "loading" } | { kind: "ready"; items: readonly MySubmissionItem[]; pagination: { page: number; pageSize: 20 | 50 | 100; total: number; totalPages: number } } | { kind: "error"; message: string };
  locale: LocaleRuntime;
  pending?: boolean;
  localError?: string;
  onRetry?: () => void;
  onLoadMore?: () => void;
}) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "COMMON_UNABLE_TO_LOAD")}>{onRetry && <Button type="button" variant="outline" size="sm" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button>}</PageState>;
  const statusLabel = (item: MySubmissionItem) => item.status === "needs_revision" ? frontendText(locale, "SUBMISSIONS_NEEDS_REVISION") : item.status || frontendText(locale, "SUBMISSIONS_STATUS_UNAVAILABLE");
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-semibold">{frontendText(locale, "SUBMISSIONS_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "SUBMISSIONS_DESCRIPTION")}</p></div>
    {localError && <div role="alert" className="flex items-center gap-3 text-sm text-destructive"><span>{localError}</span><Button type="button" variant="outline" size="sm" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button></div>}
    <DataTable
      locale={locale}
      rows={state.items}
      rowId={(item) => item.id}
      ariaLabel={frontendText(locale, "SUBMISSIONS_TITLE")}
      loadingMoreLabel={frontendText(locale, "SUBMISSIONS_LOAD_MORE")}
      emptyState={<PageState kind="empty" title={frontendText(locale, "SUBMISSIONS_EMPTY")} />}
      loading={pending}
      hasMore={!localError && state.pagination.page < state.pagination.totalPages}
      onLoadMore={onLoadMore}
      rowHeight={88}
      columns={[
        { key: "item", header: frontendText(locale, "SUBMISSIONS_COLUMN_ITEM"), cell: (item) => <div className="py-1"><p className="font-medium">{item.title?.trim() || frontendText(locale, "SUBMISSIONS_UNTITLED")}</p><p className="mt-1 text-xs text-muted-foreground">{item.id}</p></div> },
        { key: "status", header: frontendText(locale, "SUBMISSIONS_COLUMN_STATUS"), width: "200px", cell: (item) => <div className="flex items-center gap-3"><Badge variant={item.status === "needs_revision" ? "warning" : "outline"}>{statusLabel(item)}</Badge>{item.status === "needs_revision" && <button type="button" className="text-sm font-medium text-primary hover:underline">{frontendText(locale, "SUBMISSIONS_RESUBMIT")}</button>}</div> },
        { key: "review", header: frontendText(locale, "SUBMISSIONS_COLUMN_REVIEW"), width: "40%", cellClassName: "whitespace-normal", cell: (item) => {
          if (!item.review) return null;
          const note = item.review.note.trim();
          return <div role="note" className="space-y-1 py-1"><p className="text-sm"><span className="font-medium">{frontendText(locale, "SUBMISSIONS_REVIEW_REASON")}：</span>{frontendText(locale, reviewReasonKey(item.review.reasonCode))}</p>{note && <p className="line-clamp-1 text-sm text-muted-foreground"><span className="font-medium">{frontendText(locale, "SUBMISSIONS_REVIEW_NOTE")}：</span>{note}</p>}</div>;
        } },
      ]}
    />
  </section>;
}

function reviewReasonKey(reasonCode: NonNullable<MySubmissionItem["review"]>["reasonCode"]): string {
  switch (reasonCode) {
    case "not_relevant": return "SUBMISSIONS_REASON_NOT_RELEVANT";
    case "duplicate": return "SUBMISSIONS_REASON_DUPLICATE";
    case "unsafe": return "SUBMISSIONS_REASON_UNSAFE";
    case "needs_revision": return "SUBMISSIONS_REASON_NEEDS_REVISION";
  }
}
