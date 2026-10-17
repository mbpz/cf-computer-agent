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
 *
 * This adapter is also the whole app's modal contract, and beUI's installed
 * `motion/center-morph-modal` cannot carry it — so the surface stays here, and
 * that file stays the source for surfaces that can accept its shape:
 *
 * - `CenterMorphModalContent` renders nothing until its own mount effect runs
 *   (`motion/center-morph-modal.tsx:200` sets the flag, `:251` returns null), so
 *   an open dialog has no markup outside a live browser. `test/unit/frontend-focus-scope.test.tsx`
 *   renders an open dialog with `renderToStaticMarkup` and asserts the panel's
 *   `data-focus-scope` and `tabindex` there.
 * - It portals unconditionally (`:253`). Every dialog except the command
 *   palette renders inline unless the caller passes `portal`, which is what
 *   keeps the panel inside the container the dialog, confirmation and admin
 *   suites query (`container.querySelector('[role="alertdialog"]')`, the
 *   `data-*-dialog` hooks) and inside the caller's own stacking and `inert`
 *   context.
 * - Its props stop at `children`/`ariaLabel`/`className`/`backdropClassName`
 *   (`:188-199`). The call sites need `role="alertdialog"`, `aria-labelledby`,
 *   `onKeyDown` and `data-*` on the panel element itself, all of which land
 *   here through the rest-props spread below.
 * - It brings its own modal machinery — body scroll lock (`:208`), a window
 *   Tab trap (`:242`), Escape (`:217`) and focus return to the element named by
 *   `context.triggerId` (`:247`). That would run alongside `useFocusScope`,
 *   double-handling Tab and Escape, and for the call sites that open from a
 *   controller rather than a `CenterMorphModalTrigger` it would return focus to
 *   nothing at all.
 * - Its accessible names are hardcoded English (`closeButtonLabel = "Close
 *   modal"` `:194`, the backdrop's `aria-label="Dismiss modal"` `:261`) and its
 *   close control is on by default (`:193`), in a shell that names every
 *   control in both locales, where this wave may not add i18n keys.
 *
 * Adoption therefore needs the affected suites moved off static markup and onto
 * DOM mounting, and the app to accept a portalled dialog everywhere — a
 * parent-level decision, not a change to this file.
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
    <motion.div ref={ref} role="dialog" aria-modal="true" data-focus-scope={open ? "true" : "false"} tabIndex={-1} initial={reduce ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18, ease: EASE_OUT }} className={cn("fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border p-6 material-panel", className)} {...props} />
  </>;
  return portal && typeof document !== "undefined" ? createPortal(surface, document.body) : surface;
};
export const DialogTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className={cn("text-lg font-semibold", className)} {...props} />;
