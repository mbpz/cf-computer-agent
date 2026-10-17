import * as React from "react";
import { cn } from "../../lib/utils";
import { fieldShellClass } from "./input";

/**
 * The native select for form fields: it keeps the platform picker (form
 * association, `<optgroup>`, the operating system's own wheel on touch) and is
 * drawn on the shared field shell (`ui/input.tsx`), so a form field, a text field
 * and a page-size control are the same field.
 *
 * A toolbar filter row is not this control: it is `ui/filter-select.tsx`, built on
 * beUI's `motion/select` listbox and carrying the filter landmarks. Keeping both
 * means every surface has exactly one picker; a filter row never reaches for a
 * native select, and a form field never grows a second listbox implementation.
 */
export const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(({ className, children, ...props }, ref) => <select ref={ref} className={cn("flex h-11 w-full rounded-full px-3.5 text-base leading-6", fieldShellClass, "bg-background", className)} {...props}>{children}</select>);
Select.displayName = "Select";

export const SelectOption = React.forwardRef<HTMLOptionElement, React.ComponentProps<"option">>((props, ref) => <option ref={ref} {...props} />);
SelectOption.displayName = "SelectOption";
