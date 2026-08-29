import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { SearchResultList, type SearchResultItem } from "../components/search/search-result-list";
import { PageState } from "../components/ui/page-state";
import { DataPagination } from "../components/data-pagination";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { SavedViewItem } from "../lib/saved-views-data";

export type SearchState =
  | { kind: "loading" }
  | { kind: "ready"; query?: string; degraded: boolean; results: readonly SearchResultItem[]; pagination: { page: number; pageSize: 20 | 50 | 100; total: number; totalPages: number } }
  | { kind: "error"; message: string };

export function SearchPage({ state, locale, query = "", pending = false, localError, onQueryChange, onSubmit, onPageChange, onPageSizeChange, onRetry, savedViews, onSaveView, onApplyView, onDeleteView, savedViewPending = false, savedViewError }: {
  state: SearchState;
  locale?: LocaleRuntime;
  query?: string;
  onQueryChange?: (query: string) => void;
  onSubmit?: () => void;
  pending?: boolean; localError?: string; onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: 20 | 50 | 100) => void;
  onRetry?: () => void;
  savedViews?: readonly SavedViewItem[];
  onSaveView?: (name: string) => void;
  onApplyView?: (view: SavedViewItem) => void;
  onDeleteView?: (id: string) => void;
  savedViewPending?: boolean;
  savedViewError?: string;
}) {
  const [savedViewName, setSavedViewName] = useState("");
  const resultQuery = state.kind === "ready" && state.query !== undefined ? state.query : query;
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-semibold">{frontendText(locale, "SEARCH_TITLE")}</h1></div>
    <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}>
      <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="knowledge-search">{frontendText(locale, "SEARCH_QUERY_LABEL")}</Label><Input id="knowledge-search" name="q" value={resultQuery} onChange={(event) => onQueryChange?.(event.currentTarget.value)} placeholder={frontendText(locale, "SEARCH_QUERY_PLACEHOLDER")} autoComplete="off" /></div>
      <Button type="submit" disabled={!onSubmit}>{frontendText(locale, "SEARCH_SUBMIT")}</Button>
    </form>
    {(savedViews || onSaveView) && <div className="rounded-lg border bg-card p-4" data-saved-view-controls>
      {savedViewError && <p role="alert" className="mb-3 text-sm text-destructive">{savedViewError}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-sm font-semibold">{frontendText(locale, "SEARCH_SAVED_VIEWS")}</h2><p className="mt-1 text-xs text-muted-foreground">{frontendText(locale, "SEARCH_SAVED_VIEWS_DESCRIPTION")}</p></div>
        {onSaveView && <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const name = savedViewName.trim(); if (!name) return; onSaveView(name); setSavedViewName(""); }}>
          <Input aria-label={frontendText(locale, "SEARCH_SAVED_VIEW_NAME")} value={savedViewName} onChange={(event) => setSavedViewName(event.currentTarget.value)} placeholder={frontendText(locale, "SEARCH_SAVED_VIEW_NAME_PLACEHOLDER")} maxLength={80} />
          <Button type="submit" disabled={savedViewPending || !savedViewName.trim()}>{frontendText(locale, "SEARCH_SAVE_VIEW")}</Button>
        </form>}
      </div>
      {!!savedViews?.length && <div className="mt-3 flex flex-wrap gap-2">{savedViews.map((view) => <div key={view.id} className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-sm"><button type="button" className="font-medium hover:underline" onClick={() => onApplyView?.(view)}>{view.name}</button><button type="button" aria-label={`${frontendText(locale, "SEARCH_DELETE_VIEW")}: ${view.name}`} className="rounded px-1 text-muted-foreground hover:bg-muted" onClick={() => onDeleteView?.(view.id)}>×</button></div>)}</div>}
    </div>}
    {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
      : state.kind === "error" ? <PageState kind="error" title={state.message || frontendText(locale, "COMMON_SEARCH_UNAVAILABLE")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button></PageState>
      : <>
        {localError && <div role="alert" className="flex items-center gap-3 text-sm text-destructive"><span>{localError}</span><Button type="button" variant="outline" size="sm" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button></div>}
        {state.degraded && <PageState kind="degraded" title={frontendText(locale, "SEARCH_DEGRADED")} />}
        {state.results.length ? <SearchResultList locale={locale} results={state.results} /> : <PageState kind="empty" title={frontendText(locale, "SEARCH_EMPTY")} />}
        <DataPagination {...state.pagination} pending={pending} onPageChange={(page) => onPageChange?.(page)} onPageSizeChange={(size) => onPageSizeChange?.(size)} />
      </>}
  </section>;
}
