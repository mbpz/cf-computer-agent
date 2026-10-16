import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * Native input kept for event-style call sites, styled to beUI's field language
 * (see frontend/components/motion/input.tsx): 44px tall, pill outline, ring focus,
 * destructive ring on error. Dialogs that want beUI's label/error chrome use
 * `motion/input` directly.
 */
export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type} className={cn("flex h-11 w-full rounded-full border border-border bg-transparent px-4 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25", className)} {...props} />
  ),
);
Input.displayName = "Input";
