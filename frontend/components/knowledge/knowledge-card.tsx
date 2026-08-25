import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";

export interface KnowledgeCardItem { id: string; title?: string; summary?: string; publishedAt?: string; tags?: string[]; }

export function KnowledgeCard({ item }: { item: KnowledgeCardItem }) {
  const title = item.title?.trim() || "Untitled knowledge";
  return <Card><CardHeader><CardTitle><a href={`/knowledge/${encodeURIComponent(item.id)}`} className="hover:underline">{title}</a></CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{item.summary?.trim() || "No summary provided."}</p><div className="mt-4 flex flex-wrap gap-2">{(item.tags ?? []).slice(0, 8).map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}{item.publishedAt && <span className="text-xs text-muted-foreground">{item.publishedAt}</span>}</div></CardContent></Card>;
}
