import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { PageHeader } from "../components/ui/page-header";
import type { SearchResultItem } from "../lib/search-data";
import { PageState } from "../components/ui/page-state";
import { DataTable } from "../components/data-table";
import type { AppliedFilter } from "../components/ui/applied-filters";
import { SearchChipsField } from "../components/ui/search-chips-field";
import { FilterSelect } from "../components/ui/filter-select";
import { FilterDisclosure } from "../components/ui/filter-disclosure";
import { DateRangeInput } from "../components/ui/date-range-input";
import { SharedLayoutBg } from "../components/motion/shared-layout-bg";
import { frontendText, type LocaleRuntime } from "../lib/i18n";
import type { SavedViewItem } from "../lib/saved-views-data";
import { cn } from "../lib/utils";
import type { SupportedPageSize } from "../lib/numbered-page";

/** The conditions the search location carries; the page renders them back and can change them. */
export interface SearchFilters {
  spaceId?: string;
  collectionId?: string;
  tagIds: string[];
  tagMode?: "and" | "or";
  kind?: "text" | "markdown" | "code";
  authorId?: string;
  publishedFrom?: string;
  publishedTo?: string;
}

const SEARCH_KIND_ALL = "all";
const KIND_VALUES = ["text", "markdown", "code"] as const;
const FILTER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
// A date picker states a day; the API stores canonical UTC timestamps.
const DAY = /^\d{4}-\d{2}-\d{2}$/u;

/** The editable filter fields: a day field, an author draft, and one kind choice. */
interface SearchDraft { kind: string; authorId: string; publishedFrom: string; publishedTo: string }

function searchDraftOf(filters: SearchFilters): SearchDraft {
  return { kind: filters.kind ?? SEARCH_KIND_ALL, authorId: filters.authorId ?? "", publishedFrom: dayOf(filters.publishedFrom), publishedTo: dayOf(filters.publishedTo) };
}

/** The date input value of a canonical timestamp, or "" for anything else. */
function dayOf(timestamp?: string): string {
  return timestamp && DAY.test(timestamp.slice(0, 10)) ? timestamp.slice(0, 10) : "";
}
/** The canonical timestamp of a picked day, or undefined when the field is cleared. */
function timestampOf(day: string): string | undefined {
  return DAY.test(day) ? new Date(`${day}T00:00:00.000Z`).toISOString() : undefined;
}

export type SearchState =
  | { kind: "loading" }
  | { kind: "ready"; query?: string; degraded: boolean; results: readonly SearchResultItem[]; pagination: { page: number; pageSize: 20 | 50 | 100; total: number; totalPages: number } }
  | { kind: "error"; message: string };

export function SearchPage({ state, locale, query, queryLocked = false, pending = false, localError, onQueryChange, onSubmit, onLoadMore, onPageChange, onPageSizeChange, onRetry, savedViews, onSaveView, onApplyView, onDeleteView, savedViewPending = false, savedViewError, savedViewName: controlledName, onSavedViewNameChange, savedViewConfirmation, savedViewUnknown = false, onCheckSavedView, savedViewRecordBlocked = false, onDiscardSavedViewRecord, composerBlocked = false, composerNotice, onDiscardComposer, filters, onFilterChange }: {
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
  filters?: SearchFilters; onFilterChange?: (next: SearchFilters) => void;
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
  // The condition filters apply together: one submit, one history entry, one query.
  const applied: SearchFilters = filters ?? { tagIds: [] };
  const appliedKey = JSON.stringify(applied);
  const [draft, setDraft] = useState<SearchDraft>(() => searchDraftOf(applied));
  const [filterError, setFilterError] = useState<string>();
  const draftKeyRef = useRef(appliedKey);
  // A location change (refresh, back, saved view) replaces the draft, so the fields
  // never keep describing conditions the list is no longer filtered by.
  if (draftKeyRef.current !== appliedKey) {
    draftKeyRef.current = appliedKey;
    setDraft(searchDraftOf(applied));
    setFilterError(undefined);
  }
  const kindOptions = [{ value: SEARCH_KIND_ALL, label: frontendText(locale, "SEARCH_FILTER_KIND_ALL") }, { value: "text", label: frontendText(locale, "INBOX_KIND_TEXT") }, { value: "markdown", label: frontendText(locale, "SUBMIT_MARKDOWN_LABEL") }, { value: "code", label: frontendText(locale, "SUBMIT_CODE_LABEL") }];
  // The condition filters apply together: one submit, one history entry, one query.
  // It answers whether the draft was committed, so the panel that submitted can
  // close on success and stay open on the rejection whose alert it holds.
  const commitFilters = (): boolean => {
    const authorId = draft.authorId.trim();
    if (authorId && !FILTER_ID.test(authorId)) { setFilterError(frontendText(locale, "SEARCH_FILTER_AUTHOR_INVALID")); return false; }
    const publishedFrom = timestampOf(draft.publishedFrom);
    const publishedTo = timestampOf(draft.publishedTo);
    if (publishedFrom && publishedTo && publishedFrom > publishedTo) { setFilterError(frontendText(locale, "SEARCH_FILTER_RANGE_INVALID")); return false; }
    setFilterError(undefined);
    onFilterChange?.({ ...applied, kind: KIND_VALUES.find((value) => value === draft.kind), authorId: authorId || undefined, publishedFrom, publishedTo });
    return true;
  };
  // Every applied condition stays visible as removable text. Dropping a Space drops the
  // conditions that require it, and dropping the last tag drops the tag mode with it.
  const appliedChips: AppliedFilter[] = [];
  if (applied.spaceId) appliedChips.push({ id: "spaceId", label: `${frontendText(locale, "KNOWLEDGE_FILTER_SPACE")}: ${applied.spaceId}`, onRemove: () => onFilterChange?.({ ...applied, spaceId: undefined, collectionId: undefined, tagIds: [], tagMode: undefined }) });
  if (applied.collectionId) appliedChips.push({ id: "collectionId", label: `${frontendText(locale, "KNOWLEDGE_FILTER_COLLECTION")}: ${applied.collectionId}`, onRemove: () => onFilterChange?.({ ...applied, collectionId: undefined }) });
  const dropTags = (tagId: string) => {
    const tagIds = applied.tagIds.filter((id) => id !== tagId);
    onFilterChange?.({ ...applied, tagIds, tagMode: tagIds.length > 1 ? applied.tagMode : undefined });
  };
  for (const tagId of applied.tagIds) appliedChips.push({ id: `tagId:${tagId}`, label: `${frontendText(locale, "KNOWLEDGE_FILTER_TAG")}: ${tagId}`, onRemove: () => dropTags(tagId) });
  if (applied.kind) appliedChips.push({ id: "kind", label: `${frontendText(locale, "KNOWLEDGE_FILTER_KIND")}: ${kindOptions.find((option) => option.value === applied.kind)?.label ?? applied.kind}`, onRemove: () => onFilterChange?.({ ...applied, kind: undefined }) });
  if (applied.authorId) appliedChips.push({ id: "authorId", label: `${frontendText(locale, "KNOWLEDGE_FILTER_AUTHOR")}: ${applied.authorId}`, onRemove: () => onFilterChange?.({ ...applied, authorId: undefined }) });
  if (applied.publishedFrom) appliedChips.push({ id: "publishedFrom", label: `${frontendText(locale, "KNOWLEDGE_FILTER_PUBLISHED_FROM")}: ${applied.publishedFrom}`, onRemove: () => onFilterChange?.({ ...applied, publishedFrom: undefined }) });
  if (applied.publishedTo) appliedChips.push({ id: "publishedTo", label: `${frontendText(locale, "KNOWLEDGE_FILTER_PUBLISHED_TO")}: ${applied.publishedTo}`, onRemove: () => onFilterChange?.({ ...applied, publishedTo: undefined }) });
  return <section className="flex flex-col gap-5 lg:h-full lg:min-h-0">
    {composerBlocked && <div role="alert" data-search-composer-blocked className="space-y-2 rounded-md border p-4 text-sm"><p>{frontendText(locale, "SEARCH_COMPOSER_RECORD_BLOCKED")}</p><Button type="button" variant="outline" onClick={onDiscardComposer}>{frontendText(locale, "SEARCH_COMPOSER_RECORD_DISCARD")}</Button></div>}
    {composerNotice && <p role="alert">{composerNotice}</p>}
    {savedViewConfirmation}
    <PageHeader title={frontendText(locale, "SEARCH_TITLE")} icon={<MagnifyingGlass size={22} weight="duotone" className="text-primary" />} />
    <div className="flex flex-wrap items-center gap-3" data-search-controls-row>
      <form className="min-w-0 flex-1 basis-72 space-y-2" onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}>
        <Label htmlFor="knowledge-search">{frontendText(locale, "SEARCH_QUERY_LABEL")}</Label>
        <SearchChipsField
          id="knowledge-search"
          name="q"
          label={frontendText(locale, "SEARCH_QUERY_LABEL")}
          placeholder={frontendText(locale, "SEARCH_QUERY_PLACEHOLDER")}
          query={inputQuery}
          onQueryChange={(value) => onQueryChange?.(value)}
          disabled={queryLocked}
          chips={onFilterChange ? appliedChips : undefined}
          appliedLabel={frontendText(locale, "COMMON_APPLIED_FILTERS")}
          clearLabel={frontendText(locale, "COMMON_CLEAR_FILTERS")}
          markedChipLabel={(chip) => frontendText(locale, "COMMON_CHIP_SELECTED").replace("{chip}", chip)}
          removedChipLabel={(chip) => frontendText(locale, "COMMON_CHIP_REMOVED").replace("{chip}", chip)}
          actions={<>
            {onFilterChange && appliedChips.length > 0 && <Button type="button" variant="ghost" size="sm" data-filters-clear className="max-lg:h-11" onClick={() => onFilterChange({ tagIds: [] })}>{frontendText(locale, "COMMON_CLEAR_FILTERS")}</Button>}
            <Button type="submit" disabled={!onSubmit || queryLocked} className="max-lg:h-11">{frontendText(locale, "SEARCH_SUBMIT")}</Button>
          </>}
        />
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
            <div ref={viewsRef} data-saved-view-list className={cn("min-w-0 flex-1 text-sm", viewsExpanded ? "line-clamp-2" : "line-clamp-1")}><SharedLayoutBg className="contents" inset={2} pillClassName="rounded-md bg-muted/60">{savedViews.map((view) => <span key={view.id} className="mr-2 inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 align-middle"><button type="button" data-saved-view-apply={view.id} className="font-medium hover:underline" disabled={savedViewPending} onClick={() => onApplyView?.(view)}>{view.name}</button><button type="button" disabled={savedViewPending || !onDeleteView} aria-label={`${frontendText(locale, "SEARCH_DELETE_VIEW")}: ${view.name}`} className="rounded px-1 text-muted-foreground hover:bg-muted" onClick={() => onDeleteView?.(view.id)}>×</button></span>)}</SharedLayoutBg></div>
            {viewsOverflowing && <Button type="button" size="sm" variant="ghost" data-saved-view-toggle className="h-6 shrink-0 px-2 text-xs" aria-expanded={viewsExpanded} onClick={() => setViewsExpanded((current) => !current)}>{frontendText(locale, viewsExpanded ? "COMMON_COLLAPSE" : "COMMON_EXPAND")}</Button>}
          </div>}
        </div>
      </div>}
    </div>
    {onFilterChange && <FilterDisclosure
      label={frontendText(locale, "COMMON_FILTERS")}
      appliedCount={appliedChips.length}
      rowClassName="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 p-3"
      /* The row is a form on both surfaces: the Apply button only submits while it
         is inside the form element, and the panel renders that same element. A
         successful commit dismisses the panel so the results are what is left on
         screen; a rejected draft keeps it open, where its alert is. */
      renderRow={(className, close) => <form data-search-filters className={className} onSubmit={(event) => { event.preventDefault(); if (commitFilters()) close(); }}>
        <FilterSelect label={frontendText(locale, "KNOWLEDGE_FILTER_KIND")} ariaLabel={frontendText(locale, "KNOWLEDGE_FILTER_KIND")} value={draft.kind} disabled={queryLocked} options={kindOptions} onChange={(value) => setDraft((current) => ({ ...current, kind: value }))} />
        <div className="space-y-2"><Label htmlFor="search-filter-author">{frontendText(locale, "KNOWLEDGE_FILTER_AUTHOR")}</Label><Input id="search-filter-author" data-search-filter-author className="w-48 max-lg:w-full" value={draft.authorId} disabled={queryLocked} autoComplete="off" placeholder={frontendText(locale, "SEARCH_FILTER_AUTHOR_PLACEHOLDER")} onChange={(event) => setDraft((current) => ({ ...current, authorId: event.currentTarget.value }))} /></div>
        <DateRangeInput
          value={{ from: draft.publishedFrom, to: draft.publishedTo }}
          onChange={(next) => setDraft((current) => ({ ...current, publishedFrom: next.from, publishedTo: next.to }))}
          locale={locale.locale}
          disabled={queryLocked}
          texts={{
            label: `${frontendText(locale, "KNOWLEDGE_FILTER_PUBLISHED_FROM")} – ${frontendText(locale, "KNOWLEDGE_FILTER_PUBLISHED_TO")}`,
            placeholder: `${frontendText(locale, "KNOWLEDGE_FILTER_PUBLISHED_FROM")} – ${frontendText(locale, "KNOWLEDGE_FILTER_PUBLISHED_TO")}`,
            start: frontendText(locale, "KNOWLEDGE_FILTER_PUBLISHED_FROM"),
            end: frontendText(locale, "KNOWLEDGE_FILTER_PUBLISHED_TO"),
            clear: frontendText(locale, "COMMON_CLEAR_FILTERS"),
          }}
          triggerProps={{ "data-search-filter-published-from": "", "data-search-filter-published-to": "" }}
          className="max-lg:w-full"
        />
        <Button type="submit" data-search-filters-apply disabled={queryLocked} className="max-lg:h-11">{frontendText(locale, "SEARCH_FILTERS_APPLY")}</Button>
        {filterError && <p role="alert" className="text-sm text-destructive">{filterError}</p>}
      </form>}
    />}
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
