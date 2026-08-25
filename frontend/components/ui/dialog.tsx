import * as React from "react";
import { cn } from "../../lib/utils";
import { useFocusScope } from "./focus-scope";

const DialogContext = React.createContext<{ open: boolean; onOpenChange?: (open: boolean) => void }>({ open: false });

export function Dialog({ open = false, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) {
  return <DialogContext.Provider value={{ open, onOpenChange }}><div data-dialog-open={open ? "true" : "false"}>{children}</div></DialogContext.Provider>;
}

export const DialogContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const { open, onOpenChange } = React.useContext(DialogContext);
  const ref = useFocusScope(open, () => onOpenChange?.(false));
  return <div ref={ref} role="dialog" aria-modal="true" data-focus-scope={open ? "true" : "false"} tabIndex={-1} className={cn("fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg", className)} {...props} />;
};
export const DialogTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className={cn("text-lg font-semibold", className)} {...props} />;
