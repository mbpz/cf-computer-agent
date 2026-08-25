import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";

export interface KnowledgeCardItem { id: string; title?: string; summary?: string; publishedAt?: string; tags?: string[]; }

export function KnowledgeCard({ item, locale }: { item: KnowledgeCardItem; locale?: LocaleRuntime }) {
  const title = item.title?.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED");
  return <Card><CardHeader><CardTitle><a href={`/knowledge/${encodeURIComponent(item.id)}`} className="hover:underline">{title}</a></CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{item.summary?.trim() || frontendText(locale, "KNOWLEDGE_NO_SUMMARY")}</p><div className="mt-4 flex flex-wrap gap-2">{(item.tags ?? []).slice(0, 8).map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}{item.publishedAt && <span className="text-xs text-muted-foreground">{item.publishedAt}</span>}</div></CardContent></Card>;
}
