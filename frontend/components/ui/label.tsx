import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * Native label, on beUI's field-label tokens (`motion/input.tsx` owns the field
 * chrome). beUI ships no label slug, so this stays a plain `<label>`: the
 * association (`htmlFor`) is the platform's, and `peer-*` keeps the disabled state
 * of the field it names.
 */
export const Label = React.forwardRef<HTMLLabelElement, React.ComponentProps<"label">>(
  ({ className, ...props }, ref) => <label ref={ref} className={cn("text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)} {...props} />,
);
Label.displayName = "Label";
