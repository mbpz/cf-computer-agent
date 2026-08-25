export interface SearchResultItem { id: string; title?: string; snippet?: string; href: string; matchedFields?: string[]; }

export function SearchResultList({ results }: { results: readonly SearchResultItem[] }) {
  return <div className="space-y-3">{results.map((result) => <article key={result.id} className="rounded-lg border bg-card p-4"><h3 className="font-medium"><a href={result.href} className="hover:underline">{result.title?.trim() || "Untitled result"}</a></h3><p className="mt-2 text-sm text-muted-foreground">{result.snippet?.trim() || "No excerpt available."}</p>{result.matchedFields?.length ? <p className="mt-3 text-xs text-muted-foreground">Matched: {result.matchedFields.join(", ")}</p> : null}</article>)}</div>;
}
