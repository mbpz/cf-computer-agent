import * as React from "react";
import { cn } from "../../lib/utils";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {}

/**
 * The app's checkbox, drawn in beUI's checkbox geometry (`motion/checkbox.tsx`):
 * a 20px box with the primary accent and the same ring + offset focus. It stays a
 * native input on purpose — call sites bind `checked`/`onChange` and pass their
 * `data-*` hooks, and the suites that drive them assert a real `input[type=checkbox]`
 * (`test/unit/frontend-review-batch.test.tsx`, `test/unit/frontend-admin-asset-hygiene.test.tsx`).
 * `motion/checkbox` is the animated control for surfaces that own their own state;
 * it takes `checked`/`onCheckedChange` and forwards no arbitrary props.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ className, ...props }, ref) {
  return <input ref={ref} type="checkbox" className={cn("size-5 shrink-0 cursor-pointer rounded-md accent-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60", className)} {...props} />;
});
