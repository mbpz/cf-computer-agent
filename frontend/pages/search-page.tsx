import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { SearchResultList, type SearchResultItem } from "../components/search/search-result-list";
import { PageState } from "../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../lib/i18n";

export type SearchState =
  | { kind: "loading" }
  | { kind: "ready"; query?: string; degraded: boolean; results: readonly SearchResultItem[]; nextCursor?: string | null; pending?: boolean }
  | { kind: "error"; message: string };

export function SearchPage({ state, locale, query = "", onQueryChange, onSubmit, onLoadMore, onRetry }: {
  state: SearchState;
  locale?: LocaleRuntime;
  query?: string;
  onQueryChange?: (query: string) => void;
  onSubmit?: () => void;
  onLoadMore?: () => void;
  onRetry?: () => void;
}) {
  const resultQuery = state.kind === "ready" && state.query !== undefined ? state.query : query;
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-semibold">{frontendText(locale, "SEARCH_TITLE")}</h1></div>
    <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}>
      <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="knowledge-search">{frontendText(locale, "SEARCH_QUERY_LABEL")}</Label><Input id="knowledge-search" name="q" value={resultQuery} onChange={(event) => onQueryChange?.(event.currentTarget.value)} placeholder={frontendText(locale, "SEARCH_QUERY_PLACEHOLDER")} autoComplete="off" /></div>
      <Button type="submit" disabled={!onSubmit}>{frontendText(locale, "SEARCH_SUBMIT")}</Button>
    </form>
    {state.kind === "loading" ? <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />
      : state.kind === "error" ? <PageState kind="error" title={state.message || frontendText(locale, "COMMON_SEARCH_UNAVAILABLE")}><Button className="mt-4" variant="outline" onClick={onRetry}>{frontendText(locale, "SEARCH_RETRY")}</Button></PageState>
      : <>
        {state.degraded && <PageState kind="degraded" title={frontendText(locale, "SEARCH_DEGRADED")} />}
        {state.results.length ? <SearchResultList locale={locale} results={state.results} /> : <PageState kind="empty" title={frontendText(locale, "SEARCH_EMPTY")} />}
        {state.nextCursor && <Button variant="outline" disabled={state.pending} onClick={onLoadMore}>{state.pending ? frontendText(locale, "SEARCH_LOADING_MORE") : frontendText(locale, "SEARCH_LOAD_MORE")}</Button>}
      </>}
  </section>;
}
