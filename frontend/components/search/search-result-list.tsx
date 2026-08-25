import { frontendText, type LocaleRuntime } from "../../lib/i18n";

export interface SearchResultItem { id: string; title?: string; snippet?: string; href: string; matchedFields?: string[]; }

export function SearchResultList({ results, locale }: { results: readonly SearchResultItem[]; locale?: LocaleRuntime }) {
  return <div className="space-y-3">{results.map((result) => <article key={result.id} className="rounded-lg border bg-card p-4"><h3 className="font-medium"><a href={result.href} className="hover:underline">{result.title?.trim() || frontendText(locale, "SEARCH_UNTITLED")}</a></h3><p className="mt-2 text-sm text-muted-foreground">{result.snippet?.trim() || frontendText(locale, "SEARCH_NO_EXCERPT")}</p>{result.matchedFields?.length ? <p className="mt-3 text-xs text-muted-foreground">{frontendText(locale, "SEARCH_MATCHED")}: {result.matchedFields.join(", ")}</p> : null}</article>)}</div>;
}
