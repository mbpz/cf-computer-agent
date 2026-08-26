import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { shareKnowledgeItem } from "../../lib/system-share";

export interface KnowledgeCardItem { id: string; title?: string; summary?: string; publishedAt?: string; tags?: string[]; }

export function KnowledgeCard({ item, locale }: { item: KnowledgeCardItem; locale?: LocaleRuntime }) {
  const title = item.title?.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED");
  const [shareState, setShareState] = useState<"idle" | "shared" | "unavailable">("idle");
  const share = async () => {
    if (typeof window === "undefined") return;
    try {
      const result = await shareKnowledgeItem({ id: item.id, title, origin: window.location.origin, navigator, confirm: () => window.confirm(frontendText(locale, "KNOWLEDGE_SHARE_CONFIRM")) });
      setShareState(result === "shared" ? "shared" : "idle");
    } catch { setShareState("unavailable"); }
  };
  return <Card><CardHeader><CardTitle><a href={`/knowledge/${encodeURIComponent(item.id)}`} className="hover:underline">{title}</a></CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{item.summary?.trim() || frontendText(locale, "KNOWLEDGE_NO_SUMMARY")}</p><div className="mt-4 flex flex-wrap items-center gap-2">{(item.tags ?? []).slice(0, 8).map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}{item.publishedAt && <span className="text-xs text-muted-foreground">{item.publishedAt}</span>}<button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => void share()}>{frontendText(locale, "KNOWLEDGE_SHARE_ACTION")}</button>{shareState === "shared" && <span role="status" className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_SHARE_DONE")}</span>}{shareState === "unavailable" && <span role="status" className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_SHARE_UNAVAILABLE")}</span>}</div></CardContent></Card>;
}
