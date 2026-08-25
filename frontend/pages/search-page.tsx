import { Alert, AlertDescription } from "../components/ui/alert";
import { SearchResultList, type SearchResultItem } from "../components/search/search-result-list";
import { Skeleton } from "../components/ui/skeleton";
import { frontendText, type LocaleRuntime } from "../lib/i18n";

export type SearchState = { kind: "loading" } | { kind: "ready"; degraded: boolean; results: readonly SearchResultItem[] } | { kind: "error"; message: string };

export function SearchPage({ state, locale }: { state: SearchState; locale?: LocaleRuntime }) {
  if (state.kind === "loading") return <div aria-busy="true"><Skeleton className="h-20" /></div>;
  if (state.kind === "error") return <Alert variant="destructive"><AlertDescription>{state.message || frontendText(locale, "COMMON_SEARCH_UNAVAILABLE")}</AlertDescription></Alert>;
  return <section className="space-y-5"><div><h1 className="text-2xl font-semibold">{frontendText(locale, "SEARCH_TITLE")}</h1>{state.degraded && <p className="mt-2 text-sm text-amber-700">{frontendText(locale, "SEARCH_DEGRADED")}</p>}</div>{state.results.length ? <SearchResultList locale={locale} results={state.results} /> : <p className="text-sm text-muted-foreground">{frontendText(locale, "SEARCH_EMPTY")}</p>}</section>;
}
