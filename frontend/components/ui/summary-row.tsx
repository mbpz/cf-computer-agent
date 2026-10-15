import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { cn } from "../../lib/utils";

export interface SummaryRowItem {
  /** Localized field name, rendered as the muted prefix. */
  label: string;
  value: ReactNode;
}

/**
 * One line holding several labelled fields. A row that does not fit clamps to a
 * single line and offers an explicit expand control; expanded it shows at most
 * two lines. Nothing is hidden from the DOM, so assistive tech still reads the
 * full text.
 */
export function SummaryRow({ items, locale, className }: { items: readonly SummaryRowItem[]; locale?: LocaleRuntime; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  // Whether the control is worth showing is decided by the collapsed row itself.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setExpanded(false);
    setOverflowing(node.scrollHeight - node.clientHeight > 1);
  }, [items]);
  return <div className={cn("space-y-1", className)}>
    <div ref={ref} data-summary-row className={cn("text-sm", expanded ? "line-clamp-2" : "line-clamp-1")}>
      {items.map((item) => <span key={item.label} className="mr-4 inline-flex items-baseline gap-1"><span className="text-muted-foreground">{item.label}</span><span>{item.value}</span></span>)}
    </div>
    {overflowing && <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>{frontendText(locale, expanded ? "COMMON_COLLAPSE" : "COMMON_EXPAND")}</Button>}
  </div>;
}
