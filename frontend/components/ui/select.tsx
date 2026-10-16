import * as React from "react";
import { cn } from "../../lib/utils";

/** A native, dependency-free select with complete platform semantics, styled to beUI's
 * pill field language. Rich listboxes use `motion/select` instead. */
export const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(({ className, children, ...props }, ref) => <select ref={ref} className={cn("flex h-11 w-full rounded-full border border-border bg-background px-4 text-sm transition-colors focus-visible:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25", className)} {...props}>{children}</select>);
Select.displayName = "Select";

export const SelectOption = React.forwardRef<HTMLOptionElement, React.ComponentProps<"option">>((props, ref) => <option ref={ref} {...props} />);
SelectOption.displayName = "SelectOption";
