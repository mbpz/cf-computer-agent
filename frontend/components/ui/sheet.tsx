import * as React from "react";
import { cn } from "../../lib/utils";

export function Sheet({ open, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) {
  return <div data-sheet-open={open ? "true" : "false"} onKeyDown={(event) => { if (event.key === "Escape") onOpenChange?.(false); }}>{children}</div>;
}

export function SheetContent({ className, side = "left", ...props }: React.HTMLAttributes<HTMLDivElement> & { side?: "left" | "right" }) {
  return <div role="dialog" aria-modal="true" data-sheet-content data-side={side} className={cn("fixed inset-y-0 z-50 w-72 border bg-background p-6 shadow-lg", side === "right" ? "right-0" : "left-0", className)} {...props} />;
}

export const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("flex flex-col space-y-2 text-left", className)} {...props} />;
export const SheetTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className={cn("text-lg font-semibold", className)} {...props} />;
export const SheetClose = ({ className, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" className={cn("rounded-md p-2 text-sm hover:bg-accent", className)} onClick={onClick} {...props} />;
