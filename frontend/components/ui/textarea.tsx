import * as React from "react";
import { cn } from "../../lib/utils";
import { textareaFieldClass } from "./input";

/**
 * Native textarea on the shared field shell (`ui/input.tsx` imports the same
 * tokens). beUI ships no textarea, so the only local decision is the multi-line
 * geometry — the shell's panel radius instead of the single-line pill — and it
 * lives in `textareaFieldClass` next to the shell rather than being respelled here.
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(textareaFieldClass, className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";
