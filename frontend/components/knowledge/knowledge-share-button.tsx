import { useEffect, useRef, useState } from "react";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { shareKnowledgeItem } from "../../lib/system-share";

export interface KnowledgeCardItem { id: string; title?: string; summary?: string; publishedAt?: string; tags?: string[]; }

/**
 * Device share for one knowledge item, with its own pending and settled
 * announcements. Kept out of the card so list surfaces can render it on its own.
 */
export function KnowledgeShareButton({ item, locale }: { item: KnowledgeCardItem; locale?: LocaleRuntime }) {
  const title = item.title?.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED");
  const [shareState, setShareState] = useState<"idle" | "pending" | "shared" | "unavailable">("idle");
  const shareOwner = useRef<object | null>(null);
  // Unmount only retires local callbacks; it cannot cancel the device share sheet.
  useEffect(() => () => { shareOwner.current = null; }, []);
  const share = async () => {
    if (typeof window === "undefined" || shareOwner.current) return;
    // Reserve synchronously, before confirmation/await or a disabled-button render.
    const owner = {}; shareOwner.current = owner;
    setShareState("pending");
    try {
      const result = await shareKnowledgeItem({ id: item.id, title, origin: window.location.origin, navigator, confirm: () => window.confirm(frontendText(locale, "KNOWLEDGE_SHARE_CONFIRM")) });
      if (shareOwner.current === owner) setShareState(result === "shared" ? "shared" : "idle");
    } catch {
      if (shareOwner.current === owner) setShareState("unavailable");
    } finally {
      if (shareOwner.current === owner) shareOwner.current = null;
    }
  };
  return <span className="flex flex-wrap items-center gap-2"><button type="button" className="inline-flex min-h-6 items-center px-1 text-xs font-medium text-primary hover:underline" disabled={shareState === "pending"} aria-busy={shareState === "pending"} onClick={() => void share()}>{frontendText(locale, shareState === "pending" ? "KNOWLEDGE_SHARE_PENDING" : "KNOWLEDGE_SHARE_ACTION")}</button>{shareState === "shared" && <span role="status" className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_SHARE_DONE")}</span>}{shareState === "unavailable" && <span role="status" className="text-xs text-muted-foreground">{frontendText(locale, "KNOWLEDGE_SHARE_UNAVAILABLE")}</span>}</span>;
}
