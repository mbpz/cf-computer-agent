"use client";
// beui.dev/components/motion/center-morph-modal
//
// §17 controlled-localization patches (slug: center-morph-modal). Everything
// outside this list is the payload verbatim: the unfold/fold animation, the
// unconditional portal, the body scroll lock, the window Tab trap, Escape and
// the trigger focus return.
//
// 1. Labels (hardcoded English removed): `backdropLabel` names the backdrop
//    control (was `aria-label="Dismiss modal"`), and `closeButtonLabel` no
//    longer defaults to English. Preserves the app's rule that every control in
//    a modal has a name in both locales — `ui/dialog.tsx` passes the caller's
//    localized `dismissLabel`; see `frontend/components/ui/dialog.tsx:1-40`.
// 2. Attribute passthrough: `panelProps` reach the panel element itself, so
//    `role="alertdialog"`, `aria-labelledby`, `data-focus-scope`, `tabIndex`
//    and the `data-*-dialog` hooks land on the same node the suites address
//    (`test/unit/frontend-admin-duplicate-confirmation.test.tsx:34` and the
//    other 50 confirmation suites select the panel by those attributes), and
//    `backdropProps` reach the backdrop control so `[data-dialog-backdrop]`
//    keeps selecting it. `panelRef` exposes the same panel to the adapter's
//    `useFocusScope`, which owns initial focus, Tab and focus restore.
// 4. Callback extension: `onDismiss` lets the owner observe every dismissal
//    path (Escape, backdrop, close control) through one callback. The app's
//    adapter does not use it (its `CenterMorphModal` `onOpenChange` already
//    reports `setOpen(false)`); the window-level key trap now returns early on
//    `event.defaultPrevented` so a key the panel's own focus scope handled is
//    not handled a second time.
//
// Design lock applied in place (same tokens, no new scale): the payload's
// `rounded-[30px]` panel and `round 30px` clip become the theme's `--radius`
// (`rounded-lg`, 8.8px), and the close control keeps its own circle.

import { X } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  cloneElement,
  createContext,
  isValidElement,
  type AriaRole,
  type CSSProperties,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { EASE_OUT } from "../../lib/ease";
import { PresenceGate } from "../../lib/presence-gate";
import { cn } from "../../lib/utils";

type CenterMorphModalContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerId: string;
  contentId: string;
};

const CenterMorphModalContext =
  createContext<CenterMorphModalContextValue | null>(null);

function useCenterMorphModalContext(component: string) {
  const context = useContext(CenterMorphModalContext);
  if (!context) {
    throw new Error(`${component} must be used within <CenterMorphModal>`);
  }
  return context;
}

export interface CenterMorphModalProps {
  children: ReactNode;
  /** Controlled open state. */
  open?: boolean;
  /** Initial state when used uncontrolled. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * A modal whose full-size surface unfolds outward from its exact center.
 * Supports controlled and uncontrolled state through composable primitives.
 */
export function CenterMorphModal({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
}: CenterMorphModalProps) {
  const id = useId();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );

  const value = useMemo<CenterMorphModalContextValue>(
    () => ({
      open,
      setOpen,
      triggerId: `${id}-trigger`,
      contentId: `${id}-content`,
    }),
    [id, open, setOpen],
  );

  return (
    <CenterMorphModalContext.Provider value={value}>
      {children}
    </CenterMorphModalContext.Provider>
  );
}

export interface CenterMorphModalTriggerProps {
  children: ReactElement;
}

/** Wraps one interactive element and opens or closes the modal. */
export function CenterMorphModalTrigger({
  children,
}: CenterMorphModalTriggerProps) {
  const context = useCenterMorphModalContext("CenterMorphModalTrigger");
  if (!isValidElement(children)) return children;

  const child = children as ReactElement<Record<string, unknown>>;
  const childOnClick = child.props.onClick as
    | ((event: React.MouseEvent<HTMLElement>) => void)
    | undefined;

  return cloneElement(child, {
    id: context.triggerId,
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      childOnClick?.(event);
      if (!event.defaultPrevented) context.setOpen(!context.open);
    },
    "aria-haspopup": "dialog",
    "aria-expanded": context.open,
    "aria-controls": context.open ? context.contentId : undefined,
  });
}

export interface CenterMorphModalCloseProps {
  children: ReactElement;
}

/** Wraps one interactive element and closes the modal. */
export function CenterMorphModalClose({
  children,
}: CenterMorphModalCloseProps) {
  const context = useCenterMorphModalContext("CenterMorphModalClose");
  if (!isValidElement(children)) return children;

  const child = children as ReactElement<Record<string, unknown>>;
  const childOnClick = child.props.onClick as
    | ((event: React.MouseEvent<HTMLElement>) => void)
    | undefined;

  return cloneElement(child, {
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      childOnClick?.(event);
      if (!event.defaultPrevented) context.setOpen(false);
    },
  });
}

/**
 * [patch 2] Panel attributes. Only attributes a caller can meaningfully put on
 * the panel are named here; everything else (`data-*` hooks, which the suites
 * address) rides the template-literal index. Motion's own props are not part of
 * this contract: the payload owns the animation.
 */
export type CenterMorphPanelProps = {
  id?: string;
  role?: AriaRole;
  tabIndex?: number;
  className?: string;
  style?: CSSProperties;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onKeyUp?: KeyboardEventHandler<HTMLDivElement>;
  onClick?: MouseEventHandler<HTMLDivElement>;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-modal"?: boolean;
  [attribute: `data-${string}`]: unknown;
};

export interface CenterMorphModalContentProps {
  children: ReactNode;
  /** Accessible name announced by screen readers. */
  ariaLabel?: string;
  /** Optional id of descriptive content inside the modal. */
  ariaDescribedBy?: string;
  /** Close on Escape or backdrop press. Default true. */
  dismissible?: boolean;
  /** Render the close control inside the panel's top-right corner. Default true. */
  showCloseButton?: boolean;
  /** [patch 1] Accessible name of the close control. Required when it renders. */
  closeButtonLabel?: string;
  /** [patch 1] Accessible name of the backdrop control that dismisses the modal. */
  backdropLabel: string;
  /** [patch 2] Attributes for the panel element itself (role, aria-*, data-*, tabIndex). */
  panelProps?: CenterMorphPanelProps;
  /** [patch 2] Attributes for the backdrop control (the `data-*` hooks that address it). */
  backdropProps?: {
    className?: string;
    [attribute: `data-${string}`]: unknown;
  };
  /** [patch 2] The panel node, for an owner that runs its own focus scope. */
  panelRef?: Ref<HTMLDivElement>;
  /** [patch 4] Every dismissal path (Escape, backdrop, close control) reports here. */
  onDismiss?: () => void;
  className?: string;
  backdropClassName?: string;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const CENTER_FOLDED_CLIP =
  "inset(48% 48% 48% 48% round 8.8px)";
// 8.8px is the resolved value of `--radius` (0.55rem): the panel paints
// `rounded-lg`, which Tailwind maps to `var(--radius)`, so the clip and the box
// corners share one scale instead of the payload's 30px.
const CENTER_OPEN_CLIP = "inset(0% 0% 0% 0% round 8.8px)";

// Complex clip-path strings can snap when a spring resolves its final distance.
// Keep the radius constant so the whole duration reads as surface unfolding,
// rather than finishing early and spending its last frames rounding corners.
const CENTER_UNFOLD_EASE = [0.2, 0, 0.2, 1] as const;
const CENTER_UNFOLD_TRANSITION = {
  duration: 0.43,
  ease: CENTER_UNFOLD_EASE,
} as const;

function getFocusableElements(root: HTMLElement | null) {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => element.tabIndex >= 0);
}

export function CenterMorphModalContent({
  children,
  ariaLabel,
  ariaDescribedBy,
  dismissible = true,
  showCloseButton = true,
  closeButtonLabel,
  backdropLabel,
  panelProps,
  backdropProps,
  panelRef: panelRefProp,
  onDismiss,
  className,
  backdropClassName,
}: CenterMorphModalContentProps) {
  const context = useCenterMorphModalContext("CenterMorphModalContent");
  const reduce = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // The adapter's focus scope and the payload's own Tab trap/Escape both need
  // the panel node; both refs are written, neither replaces the other.
  const setPanelRef = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node;
      if (typeof panelRefProp === "function") panelRefProp(node);
      else if (panelRefProp) panelRefProp.current = node;
    },
    [panelRefProp],
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!context.open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = requestAnimationFrame(() => {
      const [firstFocusable] = getFocusableElements(panelRef.current);
      (firstFocusable ?? panelRef.current)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      // The adapter's `useFocusScope` listens on the panel itself and
      // preventDefaults the keys it owns (Escape, Tab). This window-level trap
      // is the outer net for keys that never reach the panel — when the panel
      // has already handled one, running it again would move focus twice and
      // call `onOpenChange` twice for a single Escape press.
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && dismissible) {
        event.preventDefault();
        context.setOpen(false);
        onDismiss?.();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = getFocusableElements(panelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      document.getElementById(context.triggerId)?.focus();
    };
  }, [context, dismissible, onDismiss]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {context.open ? (
        <PresenceGate>
          {({ isPresent, gate }) => (
            <>
              <motion.button
                type="button"
                aria-label={backdropLabel}
                tabIndex={-1}
                disabled={!dismissible}
                {...backdropProps}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                {...gate}
                transition={{
                  duration: reduce ? 0.1 : 0.28,
                  ease: EASE_OUT,
                }}
                onClick={() => {
                  context.setOpen(false);
                  onDismiss?.();
                }}
                className={cn(
                  "pointer-events-auto fixed inset-0 z-[100] h-full w-full cursor-default bg-background/10 backdrop-blur-sm",
                  backdropClassName,
                )}
              />

              {/* `inset-4` rather than `inset-0 p-4`: same content box, but the
                  layer stays off the viewport edges. It never takes pointer
                  events, so it carries `inert` alone. */}
              <div
                inert={!isPresent}
                className="pointer-events-none fixed inset-4 z-[100] flex items-center justify-center overflow-y-auto drop-shadow-2xl"
              >
                {/* Drop-shadow reads the clipped child's alpha, so depth follows the
                    unfolding silhouette without introducing another panel layer. */}
                <div className="flex w-full flex-col items-center py-8">
                  <motion.div
                    ref={setPanelRef}
                    id={context.contentId}
                    role={panelProps?.role ?? "dialog"}
                    aria-modal="true"
                    aria-label={ariaLabel}
                    aria-describedby={ariaDescribedBy}
                    tabIndex={-1}
                    {...panelProps}
                    initial={
                      reduce
                        ? { opacity: 0, clipPath: CENTER_OPEN_CLIP }
                        : { opacity: 1, clipPath: CENTER_FOLDED_CLIP }
                    }
                    animate={{
                      opacity: 1,
                      clipPath: CENTER_OPEN_CLIP,
                    }}
                    exit={
                      reduce
                        ? {
                            opacity: 0,
                            clipPath: CENTER_OPEN_CLIP,
                          }
                        : {
                            opacity: 1,
                            clipPath: CENTER_FOLDED_CLIP,
                          }
                    }
                    {...gate}
                    transition={
                      reduce
                        ? { duration: 0.14, ease: EASE_OUT }
                        : CENTER_UNFOLD_TRANSITION
                    }
                    className={cn(
                      "pointer-events-auto relative w-full max-w-[26rem] origin-center overflow-hidden rounded-lg border border-border bg-background will-change-[clip-path]",
                      className,
                      panelProps?.className,
                    )}
                  >
                    {children}

                    {showCloseButton ? (
                      <motion.button
                        type="button"
                        aria-label={closeButtonLabel}
                        onClick={() => {
                          context.setOpen(false);
                          onDismiss?.();
                        }}
                        initial={
                          reduce
                            ? { opacity: 0 }
                            : { opacity: 0, scale: 0.8 }
                        }
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{
                          opacity: 0,
                          scale: reduce ? 1 : 0.88,
                          transition: { duration: 0.1, ease: EASE_OUT },
                        }}
                        transition={{
                          delay: reduce ? 0 : 0.16,
                          duration: reduce ? 0.12 : 0.2,
                          ease: EASE_OUT,
                        }}
                        className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-foreground/[0.05] text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </motion.button>
                    ) : null}
                  </motion.div>
                </div>
              </div>
            </>
          )}
        </PresenceGate>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
