import * as React from "react";
import { CaretDown, FunnelSimple } from "@phosphor-icons/react";
import { Button } from "./button";
import { Sheet, SheetContent } from "./sheet";
import { useListMode } from "../../lib/list-mode";

/** The controls stack full width inside the panel, whatever the page's desktop row does. */
const SHEET_ROW = "flex flex-col items-stretch gap-3";
/**
 * The panel's body reserves the room an open picker needs. beUI's select keeps
 * its listbox in flow (`absolute` under its trigger), so inside a panel the list
 * is clipped by the sheet's scroll box — a filter sheet of bare content height
 * would show a sliver of options. The reserved band is taller than the longest
 * list these rows carry (six options).
 */
const SHEET_BODY = "min-h-[20rem]";

export interface FilterDisclosureProps {
  /** Names the disclosure and heads the panel it opens. */
  label: string;
  /** Applied conditions, shown as a count badge on the trigger. */
  appliedCount?: number;
  /** The row as it renders on desktop, unchanged. */
  rowClassName?: string;
  /** The row inside the panel. Defaults to the stacked column above. */
  sheetRowClassName?: string;
  /**
   * The row element, for a page whose row is not a plain div. A form's submit
   * button only works while it sits inside that form, so the row is rendered
   * through here on both surfaces; `close` dismisses the panel, which a page
   * that commits on an explicit action calls once the commit succeeded.
   */
  renderRow?: (className: string, close: () => void) => React.ReactNode;
  /** The controls, when the row element is the default div. */
  children?: React.ReactNode;
}

/**
 * The mobile half of a page's filter row, per the design research §4.5: below
 * the shell's `lg` edge (the same edge `lib/list-mode` reads, so one breakpoint
 * decides this and the table surfaces) the row moves behind one labelled bottom
 * sheet and the page shows a single disclosure trigger instead — a phone gets a
 * 44px control where a five-control wrapping line used to be.
 *
 * Desktop renders nothing but the row it rendered before: same element, same
 * class list, same children, no wrapper. The applied-condition chips stay in
 * the page outside the panel, so the current filter state is never behind the
 * disclosure; the badge only counts them.
 */
export function FilterDisclosure({ label, appliedCount = 0, rowClassName = "flex flex-wrap items-center gap-2", sheetRowClassName = SHEET_ROW, renderRow, children }: FilterDisclosureProps) {
  const mobile = useListMode() === "mobile";
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const row = (className: string) => renderRow ? renderRow(className, close) : <div className={className}>{children}</div>;
  if (!mobile) return <>{row(rowClassName)}</>;
  return <>
    <div data-filter-disclosure className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        data-filter-disclosure-trigger
        aria-haspopup="dialog"
        aria-expanded={open}
        className="h-11 w-full justify-between px-4"
        onClick={() => setOpen(true)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <FunnelSimple size={18} weight="duotone" aria-hidden="true" />
          {label}
          {appliedCount > 0 && <span data-filter-disclosure-count aria-hidden="true" className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{appliedCount}</span>}
        </span>
        <CaretDown size={16} weight="bold" aria-hidden="true" className="shrink-0 text-muted-foreground" />
      </Button>
    </div>
    {/* The sheet's own wrapper only exists while the panel does, so a closed
        disclosure leaves the page flow exactly as the desktop row did. */}
    {open && <Sheet open onOpenChange={setOpen}>
      <SheetContent side="bottom" ariaLabel={label}>
        <div data-filter-sheet-body className={SHEET_BODY}>{row(sheetRowClassName)}</div>
      </SheetContent>
    </Sheet>}
  </>;
}
