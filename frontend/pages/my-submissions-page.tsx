import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { PageState } from "../components/ui/page-state";
import { DataPagination } from "../components/data-pagination";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { MySubmissionItem } from "../lib/my-submissions-data";

export function MySubmissionsPage({ state, locale, pending = false, localError, onRetry, onPageChange, onPageSizeChange }: { state: { kind: "loading" } | { kind: "ready"; items: readonly MySubmissionItem[]; pagination: { page: number; pageSize: 20 | 50 | 100; total: number; totalPages: number } } | { kind: "error"; message: string }; locale?: LocaleRuntime; pending?: boolean; localError?: string; onRetry?: () => void; onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: 20 | 50 | 100) => void }) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "COMMON_UNABLE_TO_LOAD")}>{onRetry && <Button type="button" variant="outline" size="sm" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button>}</PageState>;
  return <section className="space-y-5"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "SUBMISSIONS_TITLE")}</h1><p className="mt-1 text-sm text-muted-foreground">{frontendText(locale, "SUBMISSIONS_DESCRIPTION")}</p></div>{localError && <div role="alert" className="flex items-center gap-3 text-sm text-destructive"><span>{localError}</span><Button type="button" variant="outline" size="sm" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button></div>}{state.items.length ? <div className="space-y-3">{state.items.map((item) => { const status = item.status === "needs_revision" ? frontendText(locale, "SUBMISSIONS_NEEDS_REVISION") : item.status || frontendText(locale, "SUBMISSIONS_STATUS_UNAVAILABLE"); const reason = item.review ? frontendText(locale, reviewReasonKey(item.review.reasonCode)) : null; return <Card key={item.id}><CardContent className="space-y-3 p-4"><div className="flex items-center justify-between gap-4"><div><p className="font-medium">{item.title?.trim() || frontendText(locale, "SUBMISSIONS_UNTITLED")}</p><p className="mt-1 text-xs text-muted-foreground">{item.id}</p></div><div className="flex items-center gap-3"><Badge variant={item.status === "needs_revision" ? "warning" : "outline"}>{status}</Badge>{item.status === "needs_revision" && <button type="button" className="text-sm font-medium text-primary hover:underline">{frontendText(locale, "SUBMISSIONS_RESUBMIT")}</button>}</div></div>{item.review && reason && <div role="note" className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm"><p><span className="font-medium">{frontendText(locale, "SUBMISSIONS_REVIEW_REASON")}：</span>{reason}</p>{item.review.note.trim() && <p className="mt-1 text-muted-foreground"><span className="font-medium">{frontendText(locale, "SUBMISSIONS_REVIEW_NOTE")}：</span>{item.review.note}</p>}</div>}</CardContent></Card>; })}</div> : <PageState kind="empty" title={frontendText(locale, "SUBMISSIONS_EMPTY")} />}<DataPagination {...state.pagination} pending={pending} onPageChange={(page) => onPageChange?.(page)} onPageSizeChange={(size) => onPageSizeChange?.(size)} /></section>;
}

function reviewReasonKey(reasonCode: MySubmissionItem["review"]["reasonCode"]): string {
  switch (reasonCode) {
    case "not_relevant": return "SUBMISSIONS_REASON_NOT_RELEVANT";
    case "duplicate": return "SUBMISSIONS_REASON_DUPLICATE";
    case "unsafe": return "SUBMISSIONS_REASON_UNSAFE";
    case "needs_revision": return "SUBMISSIONS_REASON_NEEDS_REVISION";
  }
}
