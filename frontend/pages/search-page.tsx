import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import type { SearchResultItem } from "../lib/search-data";
import { PageState } from "../components/ui/page-state";
import { DataTable } from "../components/data-table";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { SavedViewItem } from "../lib/saved-views-data";
import { cn } from "../lib/utils";
import type { SupportedPageSize } from "../lib/numbered-page";

export type SearchState =
  | { kind: "loading" }
  | { kind: "ready"; query?: string; degraded: boolean; results: readonly SearchResultItem[]; pagination: { page: number; pageSize: 20 | 50 | 100; total: number; totalPages: number } }
  | { kind: "error"; message: string };

export function SearchPage({ state, locale, query, queryLocked = false, pending = false, localError, onQueryChange, onSubmit, onLoadMore, onPageChange, onPageSizeChange, onRetry, savedViews, onSaveView, onApplyView, onDeleteView, savedViewPending = false, savedViewError, savedViewName: controlledName, onSavedViewNameChange, savedViewConfirmation, savedViewUnknown = false, onCheckSavedView, savedViewRecordBlocked = false, onDiscardSavedViewRecord, composerBlocked = false, composerNotice, onDiscardComposer }: {
  state: SearchState;
  locale: LocaleRuntime;
  query?: string; queryLocked?: boolean;
  onQueryChange?: (query: string) => void;
  onSubmit?: () => void;
  pending?: boolean; localError?: string; onLoadMore?: () => void;
  onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: SupportedPageSize) => void;
  onRetry?: () => void;
  savedViews?: readonly SavedViewItem[];
  onSaveView?: (name: string) => void;
  onApplyView?: (view: SavedViewItem) => void;
  onDeleteView?: (id: string) => void;
  savedViewPending?: boolean;
  savedViewError?: string;
  savedViewUnknown?: boolean; onCheckSavedView?: () => void;
  savedViewRecordBlocked?: boolean; onDiscardSavedViewRecord?: () => void;
  savedViewName?: string; onSavedViewNameChange?: (value: string) => void; savedViewConfirmation?: ReactNode;
  composerBlocked?: boolean; composerNotice?: string; onDiscardComposer?: () => void;
}) {
  const [localName, setLocalName] = useState("");
  const savedViewName = controlledName ?? localName;
  const setSavedViewName = onSavedViewNameChange ?? setLocalName;
  const inputQuery = query ?? (state.kind === "ready" ? state.query ?? "" : "");
  // The query input and the saved views share one control row; only the tag strip
  // folds, so the clamp can never clip the input the member is typing into.
  const [viewsExpanded, setViewsExpanded] = useState(false);
  const [viewsOverflowing, setViewsOverflowing] = useState(false);
  const viewsRef = useRef<HTMLDivElement | null>(null);
  const viewsKey = (savedViews ?? []).map((view) => view.id).join("|");
  // Whether the control is worth showing is decided by the collapsed strip itself.
  useEffect(() => {
    const node = viewsRef.current;
    if (!node) { setViewsOverflowing(false); return; }
    setViewsExpanded(false);
    setViewsOverflowing(node.scrollHeight - node.clientHeight > 1);
  }, [viewsKey]);
  return <section className="flex flex-col gap-5 lg:h-full lg:min-h-0">
    {composerBlocked && <div role="alert" data-search-composer-blocked className="space-y-2 rounded-md border p-4 text-sm"><p>{frontendText(locale, "SEARCH_COMPOSER_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={onDiscardComposer}>{frontendText(locale, "SEARCH_COMPOSER_RECORD_DISCARD")}</Button></div>}
    {composerNotice && <p role="alert">{composerNotice}</p>}
    {savedViewConfirmation}
    <div><h1 className="text-2xl font-semibold">{frontendText(locale, "SEARCH_TITLE")}</h1></div>
    <div className="flex flex-wrap items-center gap-3" data-search-controls-row>
      <form className="flex min-w-0 flex-1 basis-72 items-end gap-2" onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}>
        <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="knowledge-search">{frontendText(locale, "SEARCH_QUERY_LABEL")}</Label><Input id="knowledge-search" name="q" value={inputQuery} disabled={queryLocked} onChange={(event) => onQueryChange?.(event.currentTarget.value)} placeholder={frontendText(locale, "SEARCH_QUERY_PLACEHOLDER")} autoComplete="off" /></div>
        <Button type="submit" disabled={!onSubmit || queryLocked}>{frontendText(locale, "SEARCH_SUBMIT")}</Button>
      </form>
      {(savedViews || onSaveView) && <div className="min-w-0 flex-1 basis-72 space-y-2" data-saved-view-controls>
        {savedViewError && !savedViewRecordBlocked && <p role="alert" className="text-sm text-destructive">{savedViewError}</p>}
        {savedViewRecordBlocked && <div role="alert" data-saved-view-record-blocked className="space-y-2 text-sm text-destructive"><p>{savedViewError}</p><Button type="button" variant="outline" data-saved-view-record-discard onClick={onDiscardSavedViewRecord}>{frontendText(locale, "SEARCH_SAVED_VIEW_RECORD_DISCARD")}</Button></div>}
        {savedViewUnknown && <Button data-saved-view-check type="button" variant="outline" onClick={onCheckSavedView}>{frontendText(locale, "SEARCH_SAVED_VIEW_CHECK")}</Button>}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {onSaveView && <form className="flex min-w-0 items-center gap-2 sm:w-56" onSubmit={(event) => { event.preventDefault(); const name = savedViewName.trim(); if (controlledName === undefined && !name) return; onSaveView(name); }}>
            <Input className="min-w-0 flex-1" aria-label={frontendText(locale, "SEARCH_SAVED_VIEW_NAME")} disabled={savedViewPending} value={savedViewName} onChange={(event) => setSavedViewName(event.currentTarget.value)} placeholder={frontendText(locale, "SEARCH_SAVED_VIEW_NAME_PLACEHOLDER")} maxLength={80} />
            <Button type="submit" disabled={savedViewPending || !savedViewName.trim()}>{frontendText(locale, "SEARCH_SAVE_VIEW")}</Button>
          </form>}
          {!!savedViews?.length && <div data-saved-view-row role="group" aria-label={frontendText(locale, "SEARCH_SAVED_VIEWS")} className="order-first flex min-w-0 flex-1 basis-0 items-center gap-2">
            <div ref={viewsRef} data-saved-view-list className={cn("min-w-0 flex-1 text-sm", viewsExpanded ? "line-clamp-2" : "line-clamp-1")}>{savedViews.map((view) => <span key={view.id} className="mr-2 inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 align-middle"><button type="button" data-saved-view-apply={view.id} className="font-medium hover:underline" disabled={savedViewPending} onClick={() => onApplyView?.(view)}>{view.name}</button><button type="button" disabled={savedViewPending || !onDeleteView} aria-label={`${frontendText(locale, "SEARCH_DELETE_VIEW")}: ${view.name}`} className="rounded px-1 text-muted-foreground hover:bg-muted" onClick={() => onDeleteView?.(view.id)}>×</button></span>)}</div>
            {viewsOverflowing && <Button type="button" size="sm" variant="ghost" data-saved-view-toggle className="h-6 shrink-0 px-2 text-xs" aria-expanded={viewsExpanded} onClick={() => setViewsExpanded((current) => !current)}>{frontendText(locale, viewsExpanded ? "COMMON_COLLAPSE" : "COMMON_EXPAND")}</Button>}
          </div>}
        </div>
      </div>}
    </div>
    {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
      : state.kind === "error" ? <PageState kind="error" title={state.message || frontendText(locale, "COMMON_SEARCH_UNAVAILABLE")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button></PageState>
      : <>
        {localError && <div role="alert" className="flex items-center gap-3 text-sm text-destructive"><span>{localError}</span><Button type="button" variant="outline" size="sm" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button></div>}
        {state.degraded && <PageState kind="degraded" title={frontendText(locale, "SEARCH_DEGRADED")} />}
        <DataTable
          locale={locale}
          rows={state.results}
          rowId={(result) => result.id}
          ariaLabel={frontendText(locale, "SEARCH_TITLE")}
          emptyState={<PageState kind="empty" title={frontendText(locale, "SEARCH_EMPTY")} />}
          loading={pending}
          pagination={state.pagination}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          hasMore={!localError && state.pagination.page < state.pagination.totalPages}
          onLoadMore={onLoadMore}
          fill
          className="lg:min-h-0 lg:flex-1"
          rowHeight={72}
          columns={[
            { key: "result", header: frontendText(locale, "SEARCH_COLUMN_RESULT"), cellClassName: "whitespace-normal", cell: (result) => <div className="py-1"><a href={result.href} className="line-clamp-1 font-medium hover:underline">{result.title?.trim() || frontendText(locale, "SEARCH_UNTITLED")}</a></div> },
            { key: "excerpt", header: frontendText(locale, "SEARCH_COLUMN_EXCERPT"), width: "45%", cellClassName: "whitespace-normal", cell: (result) => <p className="line-clamp-1 py-1 text-sm text-muted-foreground">{result.snippet?.trim() || frontendText(locale, "SEARCH_NO_EXCERPT")}</p> },
            { key: "matched", header: frontendText(locale, "SEARCH_MATCHED"), width: "220px", cellClassName: "whitespace-normal", cell: (result) => <div className="flex flex-wrap items-center gap-3 py-1">{result.matchedFields?.length ? <p className="line-clamp-1 text-xs text-muted-foreground">{frontendText(locale, "SEARCH_MATCHED")}: {result.matchedFields.join(", ")}</p> : null}{result.knowledgeItemId && <a href={`/agent?scope=items&knowledgeItemId=${encodeURIComponent(result.knowledgeItemId)}`} className="text-xs font-medium text-primary hover:underline">{frontendText(locale, "SEARCH_ASK_RESULT")}</a>}</div> },
          ]}
        />
      </>}
  </section>;
}
