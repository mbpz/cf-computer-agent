import * as React from "react";
import { cn } from "../../lib/utils";

interface TooltipContextValue {
  id: string;
  open: boolean;
  setOpen(open: boolean): void;
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function Tooltip({ children }: { children: React.ReactNode }) {
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  return <TooltipContext.Provider value={{ id, open, setOpen }}><span className="relative inline-flex w-full">{children}</span></TooltipContext.Provider>;
}

export function TooltipTrigger({ asChild = false, children }: { asChild?: boolean; children: React.ReactElement<React.HTMLAttributes<HTMLElement>> }) {
  const context = useTooltip();
  const triggerProps = {
    "aria-describedby": context.open ? context.id : undefined,
    onFocus: compose(children.props.onFocus, () => context.setOpen(true)),
    onBlur: compose(children.props.onBlur, () => context.setOpen(false)),
    onMouseEnter: compose(children.props.onMouseEnter, () => context.setOpen(true)),
    onMouseLeave: compose(children.props.onMouseLeave, () => context.setOpen(false)),
  };
  if (asChild) return React.cloneElement(children, triggerProps);
  return <button type="button" {...triggerProps}>{children}</button>;
}

export function TooltipContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const context = useTooltip();
  if (!context.open) return null;
  return <div id={context.id} role="tooltip" className={cn("absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md", className)} {...props} />;
}

function useTooltip(): TooltipContextValue {
  const context = React.useContext(TooltipContext);
  if (!context) throw new Error("Tooltip components must be used inside Tooltip");
  return context;
}

function compose<E>(first: ((event: E) => void) | undefined, second: () => void) {
  return (event: E) => { first?.(event); second(); };
}
