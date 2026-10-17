import * as React from "react";
import {
  CenterMorphModal,
  CenterMorphModalContent,
  type CenterMorphPanelProps,
} from "../motion/center-morph-modal";
import { MorphingModal } from "../motion/morphing-modal";
import { cn } from "../../lib/utils";
import { useFocusScope } from "./focus-scope";

/**
 * The app's one modal, built on beUI's installed `motion/center-morph-modal`
 * (slug: center-morph-modal). The payload owns the unfolded panel, the
 * backdrop, the scroll lock, the window Tab trap, Escape and trigger focus
 * return; this adapter owns the repository contract layered on it.
 *
 * §17 patches applied to the payload (see the file header of
 * `frontend/components/motion/center-morph-modal.tsx` for the patch log):
 * 1. labels — `backdropLabel`/`closeButtonLabel`, so the backdrop and close
 *    control carry the caller's localized text (`COMMON_DISMISS` at every call
 *    site) instead of the payload's English defaults;
 * 2. attributes — `panelProps`/`panelRef`/`backdropProps`, so `role`,
 *    `aria-labelledby`, `data-focus-scope`, `tabIndex` and every `data-*-dialog`
 *    hook reach the panel element itself and `[data-dialog-backdrop]` reaches
 *    the backdrop;
 * 4. callbacks — the payload's `onDismiss` reports Escape, backdrop press and
 *    the close control; the adapter deliberately does not subscribe to it,
 *    because `CenterMorphModal`'s own `onOpenChange` already reports the same
 *    dismissal through `setOpen(false)`. Subscribing to both delivered two
 *    `onOpenChange(false)` calls per dismissal, and the panel's `useFocusScope`
 *    added a third for Escape. The window trap now ignores keys the panel
 *    already handled (`event.defaultPrevented`), so one user gesture is one
 *    `onOpenChange(false)`.
 *
 * What stays adapter-level, and why (each is a contract the suites assert):
 * - `useFocusScope` still owns initial focus, the Tab cycle and focus restore
 *   (`test/unit/frontend-focus-scope.test.tsx`). The payload's own trap remains
 *   the outer net for keys that never reach the panel; when a key does reach
 *   it, the panel listener moves focus first, so exactly one cycle happens.
 * - The panel unmounts when `open` is false. The payload would hold it for its
 *   fold animation; every confirmation suite asserts the surface is gone in the
 *   same commit the decision lands (`frontend-admin-duplicate-confirmation`
 *   `expect(dialog()).toBeNull()`), and the app's own "one surface" rule wants
 *   the closed dialog out of the tree immediately.
 * - The portal is unconditional (payload behaviour), so every suite that
 *   addressed the panel through its mount container now reads `document`; the
 *   assertions themselves are unchanged.
 * - `data-dialog-open` stays on the inline wrapper for the same reason the
 *   suites already used it: it says whether the dialog is open without
 *   depending on the portal.
 */
const DialogContext = React.createContext<{ open: boolean; onOpenChange?: (open: boolean) => void }>({ open: false });

export function Dialog({ open = false, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) {
  return <DialogContext.Provider value={{ open, onOpenChange }}><div data-dialog-open={open ? "true" : "false"}>{children}</div></DialogContext.Provider>;
}

export interface DialogContentProps extends CenterMorphPanelProps {
  children?: React.ReactNode;
  /** Localized accessible name for the backdrop and, when shown, the close control. */
  dismissLabel: string;
  /** Show the payload's own close control in the panel corner. Off by default: callers own their actions. */
  closeButton?: boolean;
  /**
   * `default` is the app modal (`center-morph-modal`, portalled). `morph` is
   * beUI's `morphing-modal` for a single panel whose inner view keeps changing
   * — the planning composers move editing → write → readback in one surface,
   * and its `layout` panel animates the height between them. Both variants keep
   * the same contract above: focus scope, `data-focus-scope`, Escape, backdrop
   * dismissal, focus restore and the caller's `data-*-dialog` hook.
   */
  variant?: "default" | "morph";
}

export const DialogContent = ({ className, dismissLabel, closeButton = false, variant = "default", children, ...props }: DialogContentProps) => {
  const { open, onOpenChange } = React.useContext(DialogContext);
  // The payload renders nothing until its mount effect runs, so the focus
  // scope arms off the ref callback (`scopeReady`) rather than off `open`
  // alone; otherwise its keyed effect would run one commit too early and never
  // re-arm. `scopeRef.current` is written by the same callback.
  const [scopeReady, setScopeReady] = React.useState(false);
  const scopeRef = useFocusScope(open && scopeReady, () => onOpenChange?.(false));
  const panelRef = React.useCallback((node: HTMLDivElement | null) => {
    scopeRef.current = node;
    setScopeReady(node !== null);
  }, [scopeRef]);
  if (!open) return null;
  const labelledBy = props["aria-labelledby"];
  const describedBy = props["aria-describedby"];
  const panel: CenterMorphPanelProps = {
    ...props,
    role: props.role ?? "dialog",
    "aria-labelledby": labelledBy,
    "data-focus-scope": "true",
    tabIndex: -1,
  };
  if (variant === "morph") {
    return (
      <MorphingModal
        viewId="content"
        onClose={() => onOpenChange?.(false)}
        placement="center"
        backdropLabel={dismissLabel}
        panelRef={panelRef}
        panelProps={panel}
        className={cn("max-w-lg p-0 material-panel", className)}
      >
        {children}
      </MorphingModal>
    );
  }
  return (
    <CenterMorphModal open onOpenChange={(next) => { if (!next) onOpenChange?.(false); }}>
      <CenterMorphModalContent
        ariaLabel={typeof props["aria-label"] === "string" ? props["aria-label"] : undefined}
        ariaDescribedBy={typeof describedBy === "string" ? describedBy : undefined}
        backdropLabel={dismissLabel}
        backdropProps={{ "data-dialog-backdrop": "" }}
        closeButtonLabel={dismissLabel}
        showCloseButton={closeButton}
        panelRef={panelRef}
        panelProps={panel}
        className={cn("max-w-lg p-6 material-panel", className)}
      >
        {children}
      </CenterMorphModalContent>
    </CenterMorphModal>
  );
};

export const DialogTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className={cn("text-lg font-semibold", className)} {...props} />;
