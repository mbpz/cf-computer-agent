import * as React from "react";
import { cn } from "../../lib/utils";
import { useFocusScope } from "./focus-scope";

const SheetContext = React.createContext<{ open: boolean; onOpenChange?: (open: boolean) => void }>({ open: false });

export function Sheet({ open = false, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) {
  return <SheetContext.Provider value={{ open, onOpenChange }}><div data-sheet-open={open ? "true" : "false"}>{children}</div></SheetContext.Provider>;
}

export function SheetContent({ className, side = "left", ...props }: React.HTMLAttributes<HTMLDivElement> & { side?: "left" | "right" }) {
  const { open, onOpenChange } = React.useContext(SheetContext);
  const ref = useFocusScope(open, () => onOpenChange?.(false));
  if (!open) return null;
  return <div ref={ref} role="dialog" aria-modal="true" data-focus-scope={open ? "true" : "false"} tabIndex={-1} data-sheet-content data-side={side} className={cn("fixed inset-y-0 z-50 w-72 border bg-background p-6 shadow-lg", side === "right" ? "right-0" : "left-0", className)} {...props} />;
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
