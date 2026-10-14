import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/utils";
import { SPRING_LAYOUT, SPRING_SWAP } from "../../lib/ease";
import { useHoverCapable } from "../../lib/hooks/use-hover-capable";

export interface ExpandableTabItem<TId extends string = string> {
  id: TId;
  label: string;
  /** Element id of the panel this tab controls. */
  controls: string;
  icon?: React.ReactNode;
}

/**
 * In-flow expandable tabs: a horizontal tablist whose active tab widens to show
 * its label, with one shared pill gliding between tabs.
 *
 * Built in-repo rather than taken from the beUI registry because the registry
 * component morphs into a floating panel and closes on outside click or Escape,
 * while these tabs drive panels that stay in the page and share their box with
 * the desktop grid. Re-selecting the active tab clears the selection, matching
 * the reader's previous toggle behaviour.
 */
export function ExpandableTabs<TId extends string>({ items, value, onValueChange, ariaLabel, className }: {
  items: readonly ExpandableTabItem<TId>[];
  value: TId | null;
  onValueChange: (id: TId | null) => void;
  ariaLabel: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const canHover = useHoverCapable();
  const uid = React.useId().replace(/:/gu, "");
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("flex flex-wrap items-center gap-1", className)}>
      {items.map((item) => {
        const active = value === item.id;
        return (
          <motion.button
            key={item.id}
            layout={reduce ? false : true}
            type="button"
            role="tab"
            id={`${uid}-tab-${item.id}`}
            aria-selected={active}
            aria-controls={item.controls}
            data-expandable-tab={item.id}
            onClick={() => onValueChange(active ? null : item.id)}
            className={cn("relative flex min-h-10 items-center rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", active ? "text-accent-foreground" : "text-muted-foreground", !active && canHover && "hover:text-foreground")}
          >
            {active ? <motion.span aria-hidden="true" layoutId={`${uid}-pill`} transition={reduce ? { duration: 0 } : SPRING_LAYOUT} className="absolute inset-0 rounded-md bg-accent" /> : null}
            <span className="relative z-10 flex items-center gap-2">
              {item.icon}
              {active ? (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={reduce ? { duration: 0 } : SPRING_SWAP} className="whitespace-nowrap">{item.label}</motion.span>
              ) : <span className="sr-only">{item.label}</span>}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
