import * as React from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { cn } from "../../lib/utils";
import { EASE_OUT } from "../../lib/ease";
import { useFocusScope } from "./focus-scope";

const DialogContext = React.createContext<{ open: boolean; onOpenChange?: (open: boolean) => void }>({ open: false });

export function Dialog({ open = false, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) {
  return <DialogContext.Provider value={{ open, onOpenChange }}><div data-dialog-open={open ? "true" : "false"}>{children}</div></DialogContext.Provider>;
}

/**
 * `portal` lifts the surface to the document body. Use it for any dialog that is
 * rendered inside an ancestor with `transform`, `filter`, `backdrop-filter` or
 * `will-change`: those properties make the ancestor the containing block for
 * `position: fixed` descendants, so the panel would centre on the ancestor box
 * instead of the viewport.
 */
export const DialogContent = ({ className, portal = false, ...props }: HTMLMotionProps<"div"> & { portal?: boolean }) => {
  const { open, onOpenChange } = React.useContext(DialogContext);
  const ref = useFocusScope(open, () => onOpenChange?.(false));
  const reduce = useReducedMotion();
  if (!open) return null;
  // Tailwind v4 compiles the centering utilities to the `translate` property,
  // so animating `transform` here never fights the -50%/-50% offset.
  const surface = <>
    {/* One shared scrim for every dialog in the app. beUI's modal paints its own
        backdrop in this style, so callers no longer add a per-dialog scrim, and the
        backdrop travels with the surface when `portal` lifts it to the body: any
        caller inside a transformed ancestor must pass `portal` for both to land on
        the viewport. */}
    <div data-dialog-backdrop className="fixed inset-0 z-50 bg-background/10 backdrop-blur-sm" aria-hidden="true" onClick={() => onOpenChange?.(false)} />
    <motion.div ref={ref} role="dialog" aria-modal="true" data-focus-scope={open ? "true" : "false"} tabIndex={-1} initial={reduce ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18, ease: EASE_OUT }} className={cn("fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6 material-panel", className)} {...props} />
  </>;
  return portal && typeof document !== "undefined" ? createPortal(surface, document.body) : surface;
};
export const DialogTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className={cn("text-lg font-semibold", className)} {...props} />;
