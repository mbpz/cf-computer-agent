import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * The app's one multi-line field. beUI ships no textarea slug, so this is the
 * single native control the app keeps: it is drawn with beUI's field tokens
 * (border, ring, destructive ring on error, muted placeholder) and takes the
 * panel radius rather than the single-line pill, which reads as a stadium on a
 * tall box. Everything else — labels, errors, icons — is beUI's `motion/input`.
 */
export const textareaFieldClass = cn(
  "flex min-h-24 w-full rounded-lg px-3.5 py-3 text-base leading-6",
  "border border-border bg-transparent text-foreground transition-colors placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25",
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(textareaFieldClass, className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";
