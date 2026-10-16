import * as React from "react";
import { Drawer } from "../motion/drawer";
import { cn } from "../../lib/utils";
import { useFocusScope } from "./focus-scope";

const SheetContext = React.createContext<{ open: boolean; onOpenChange?: (open: boolean) => void }>({ open: false });

export function Sheet({ open = false, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) {
  return <SheetContext.Provider value={{ open, onOpenChange }}><div data-sheet-open={open ? "true" : "false"}>{children}</div></SheetContext.Provider>;
}

/**
 * beUI's installed `drawer` is the one side-panel implementation in this repo:
 * the backdrop, the off-canvas slide, the Escape listener, the body scroll lock
 * and backdrop dismissal all live there, so this file adds no surface, no
 * backdrop and no motion of its own.
 *
 * It stays an adapter because `Drawer` cannot carry the modal contract the
 * shell's mobile navigation and the task editor rely on. Its props stop at
 * `open`/`onOpenChange`/`side`/`className`/`ariaLabel`, so a caller has no way
 * to reach the panel element: the focus scope (transfer into the panel, the Tab
 * trap, focus restore), `data-focus-scope` and the `data-sheet-*` hooks the
 * shell suites select on have to be layered on its children instead. Doing that
 * at each call site would repeat the modal contract three times, so it lives
 * here, once, on top of the drawer's panel.
 *
 * The panel unmounts as soon as `open` is false, which is the behaviour the
 * sheet's callers already had: no exit animation is promised to them, and the
 * sheet's default surface (`w-72 p-6`) is preserved for the call sites that do
 * not override it.
 */
export function SheetContent({ className, side = "left", ariaLabel, children }: { className?: string; side?: "left" | "right"; ariaLabel?: string; children: React.ReactNode }) {
  const { open, onOpenChange } = React.useContext(SheetContext);
  const ref = useFocusScope(open, () => { onOpenChange?.(false); });
  if (!open) return null;
  return (
    <Drawer open onOpenChange={(next) => { onOpenChange?.(next); }} side={side} ariaLabel={ariaLabel} className={cn("w-72 p-6", className)}>
      {/* `contents` keeps the drawer's panel as the only box: this element
          exists for the focus scope and the hooks, not for layout. */}
      <div ref={ref} tabIndex={-1} data-focus-scope="true" data-sheet-content data-side={side} className="contents">{children}</div>
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
