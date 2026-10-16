import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * Native textarea styled to match beUI's field language. beUI ships no textarea, so
 * the shape follows the dialog surface (rounded-2xl) rather than the pill outline
 * used by single-line fields.
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn("flex min-h-24 w-full rounded-2xl border border-border bg-transparent px-4 py-3 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";
