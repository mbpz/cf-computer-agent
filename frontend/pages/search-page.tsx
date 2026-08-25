import { Alert, AlertDescription } from "../components/ui/alert";
import { SearchResultList, type SearchResultItem } from "../components/search/search-result-list";
import { Skeleton } from "../components/ui/skeleton";

export type SearchState = { kind: "loading" } | { kind: "ready"; degraded: boolean; results: readonly SearchResultItem[] } | { kind: "error"; message: string };

export function SearchPage({ state }: { state: SearchState }) {
  if (state.kind === "loading") return <div aria-busy="true"><Skeleton className="h-20" /></div>;
  if (state.kind === "error") return <Alert variant="destructive"><AlertDescription>{state.message || "Search is unavailable."}</AlertDescription></Alert>;
  return <section className="space-y-5"><div><h1 className="text-2xl font-semibold">Search knowledge</h1>{state.degraded && <p className="mt-2 text-sm text-amber-700">Search degraded: showing bounded fallback matches.</p>}</div>{state.results.length ? <SearchResultList results={state.results} /> : <p className="text-sm text-muted-foreground">No matching knowledge.</p>}</section>;
}
