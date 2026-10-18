import * as React from "react";
import { BottomSheet } from "../motion/bottom-sheet";
import { Drawer } from "../motion/drawer";
import { cn } from "../../lib/utils";
import { useFocusScope } from "./focus-scope";

const SheetContext = React.createContext<{ open: boolean; onOpenChange?: (open: boolean) => void }>({ open: false });

export function Sheet({ open = false, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) {
  return <SheetContext.Provider value={{ open, onOpenChange }}><div data-sheet-open={open ? "true" : "false"}>{children}</div></SheetContext.Provider>;
}

/** The edges the adapter can open a panel from: the drawer's two, plus the bottom. */
export type SheetSide = "left" | "right" | "bottom";

/**
 * beUI's installed `drawer` is the one side-panel implementation in this repo:
 * the backdrop, the off-canvas slide, the Escape listener, the body scroll lock
 * and backdrop dismissal all live there, so this file adds no surface, no
 * backdrop and no motion of its own.
 *
 * It stays an adapter because `Drawer` cannot carry the modal contract the
 * shell's mobile navigation and the task editor rely on. Its props stop at
 * `open`/`onOpenChange`/`side`/`className`/`backdropClassName`/`ariaLabel`, so a caller has no way
 * to reach the panel element: the focus scope (transfer into the panel, the Tab
 * trap, focus restore), `data-focus-scope` and the `data-sheet-*` hooks the
 * shell suites select on have to be layered on its children instead. Doing that
 * at each call site would repeat the modal contract three times, so it lives
 * here, once, on top of the drawer's panel.
 *
 * `side="bottom"` is the one edge the drawer cannot express — its `side` stops
 * at left/right, its panel is inset on the vertical axis and it animates `x` —
 * so a surface that rises from the bottom is beUI's `bottom-sheet`, reached
 * through this same adapter rather than through a second panel implementation:
 * same focus scope, same `data-sheet-*` hooks, same scroll lock, same Escape
 * and backdrop dismissal. That sheet renders its title as a visible heading, so
 * the `ariaLabel` a side panel only exposes to assistive tech is what the
 * bottom panel is called on screen too.
 *
 * The panel unmounts as soon as `open` is false, which is the behaviour the
 * sheet's callers already had: no exit animation is promised to them, and the
 * sheet's default surface (`w-72 p-6`) is preserved for the call sites that do
 * not override it.
 */
export function SheetContent({ className, backdropClassName, side = "left", ariaLabel, children }: { className?: string; backdropClassName?: string; side?: SheetSide; ariaLabel?: string; children: React.ReactNode }) {
  const { open, onOpenChange } = React.useContext(SheetContext);
  // `bottom-sheet` portals only from its own mount effect onward, so the focus
  // scope must not arm on the render that first passes `open`: its effect is
  // keyed on the flag and would run while the panel still has no node, and a
  // keyed effect does not fire again when that node appears. Tracking `open`
  // here re-arms it one commit later, in the batch that mounts the portal — and
  // disarms it on close, because the panel remounts on every open.
  const [bottomReady, setBottomReady] = React.useState(false);
  React.useEffect(() => { if (side === "bottom") setBottomReady(open); }, [side, open]);
  const ref = useFocusScope(open && (side !== "bottom" || bottomReady), () => { onOpenChange?.(false); });
  if (!open) return null;
  // `contents` keeps the panel as the only box: this element exists for the
  // focus scope and the hooks, not for layout.
  const scope = <div ref={ref} tabIndex={-1} data-focus-scope="true" data-sheet-content data-side={side} className="contents">{children}</div>;
  if (side === "bottom") {
    // `auto` grows the sheet to its content: a snap-point surface would open
    // twice as tall as a two-control filter row needs it to be.
    return <BottomSheet open onOpenChange={(next) => { onOpenChange?.(next); }} title={ariaLabel} snapPoints={["auto"]} className={className}>{scope}</BottomSheet>;
  }
  return (
    <Drawer open onOpenChange={(next) => { onOpenChange?.(next); }} side={side} ariaLabel={ariaLabel} backdropClassName={backdropClassName} className={cn("w-72 p-6", className)}>
      {scope}
    </Drawer>
  );
}

export const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("flex flex-col space-y-2 text-left", className)} {...props} />;
export const SheetTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className={cn("text-lg font-semibold", className)} {...props} />;
export const SheetClose = ({ className, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const { onOpenChange } = React.useContext(SheetContext);
  return <button type="button" className={cn("rounded-md p-2 text-sm hover:bg-accent", className)} onClick={(event) => {
    onClick?.(event);
    if (!event.defaultPrevented) onOpenChange?.(false);
  }} {...props} />;
};
