import { Alert, AlertDescription } from "../components/ui/alert";
import { SearchResultList, type SearchResultItem } from "../components/search/search-result-list";
import { PageState } from "../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../lib/i18n";

export type SearchState = { kind: "loading" } | { kind: "ready"; degraded: boolean; results: readonly SearchResultItem[] } | { kind: "error"; message: string };

export function SearchPage({ state, locale }: { state: SearchState; locale?: LocaleRuntime }) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "COMMON_SEARCH_UNAVAILABLE")} />;
  return <section className="space-y-5"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "SEARCH_TITLE")}</h1>{state.degraded && <PageState kind="degraded" title={frontendText(locale, "SEARCH_DEGRADED")} />}</div>{state.results.length ? <SearchResultList locale={locale} results={state.results} /> : <PageState kind="empty" title={frontendText(locale, "SEARCH_EMPTY")} />}</section>;
}
