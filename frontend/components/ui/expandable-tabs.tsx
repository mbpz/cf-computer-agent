import * as React from "react";
import { ExpandableTabs as BeuiExpandableTabs, type ExpandableTabsItem } from "../motion/expandable-tabs";

export interface ExpandableTabItem<TId extends string = string> {
  id: TId;
  label: string;
  /** Element id of the panel this tab controls. */
  controls: string;
  icon?: React.ReactNode;
}

/**
 * beUI's `expandable-tabs` bar, in `barOnly` mode: the active tab widens to show
 * its label and one pill glides between tabs, while the panels it drives stay in
 * the page and keep their own box (the reader's mobile grid). The payload's own
 * content panel, its fixed shell and its outside-click close are skipped by the
 * bar-only mode, so this row is exactly the tablist the reader had.
 *
 * `data-expandable-tab` and `aria-controls` reach each tab through the payload's
 * `attributes`/`controls` slots, and re-selecting the active tab clears the
 * selection, which is the reader's toggle behaviour.
 */
export function ExpandableTabs<TId extends string>({ items, value, onValueChange, ariaLabel, className }: {
  items: readonly ExpandableTabItem<TId>[];
  value: TId | null;
  onValueChange: (id: TId | null) => void;
  ariaLabel: string;
  className?: string;
}) {
  return <BeuiExpandableTabs
    barOnly
    ariaLabel={ariaLabel}
    className={className}
    value={value}
    // Every bar in this app is a thumb target below `lg`, where the shell's own
    // controls stand 44px tall.
    classNames={{ tab: "max-lg:min-h-11" }}
    onValueChange={(id) => onValueChange(id as TId | null)}
    items={items.map((item): ExpandableTabsItem => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      controls: item.controls,
      attributes: { "data-expandable-tab": item.id },
    }))}
  />;
}
