import * as React from "react";
import { cn } from "../../lib/utils";

export function Dialog({ open, children }: { open?: boolean; children: React.ReactNode }) {
  return <div data-dialog-open={open ? "true" : "false"}>{children}</div>;
}

export const DialogContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div role="dialog" aria-modal="true" className={cn("fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg", className)} {...props} />;
export const DialogTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className={cn("text-lg font-semibold", className)} {...props} />;
