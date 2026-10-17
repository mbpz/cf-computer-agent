import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * The one field source for native fields.
 *
 * `motion/input.tsx` is beUI's input: it owns the label/error/icon chrome and a
 * value-style `onChange`. Native call sites need the native control instead —
 * `onChange` as an event, `defaultValue`, form association — so this file keeps
 * that control and draws it with beUI's field tokens (44px tall, pill outline,
 * 16px text, ring focus, destructive ring on error). `Textarea` shares these
 * tokens, which is what keeps the single-line and multi-line fields one field
 * instead of two lookalikes that drift.
 *
 * Geometry stays per control: a multi-line field takes the panel corner radius
 * (`--radius`) rather than the pill, which reads as a stadium on a tall box.
 */
export const fieldShellClass =
  "border border-border bg-transparent text-foreground transition-colors placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25";

/** Single-line geometry, matching `motion/input`: 44px box, pill, 16px on a 24px line. */
export const inputFieldClass = cn(
  "flex h-11 w-full rounded-full px-3.5 text-base leading-6",
  fieldShellClass,
);

/** Multi-line geometry on the same shell: the panel radius, text starting at the first line. */
export const textareaFieldClass = cn(
  "flex min-h-24 w-full rounded-lg px-3.5 py-3 text-base leading-6",
  fieldShellClass,
);

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type} className={cn(inputFieldClass, className)} {...props} />
  ),
);
Input.displayName = "Input";
