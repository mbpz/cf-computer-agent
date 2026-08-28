import * as React from "react";
import { cn } from "../../lib/utils";

/** A native, dependency-free shadcn-style select with complete platform semantics. */
export const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(({ className, children, ...props }, ref) => <select ref={ref} className={cn("flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50", className)} {...props}>{children}</select>);
Select.displayName = "Select";

export const SelectOption = React.forwardRef<HTMLOptionElement, React.ComponentProps<"option">>((props, ref) => <option ref={ref} {...props} />);
SelectOption.displayName = "SelectOption";
