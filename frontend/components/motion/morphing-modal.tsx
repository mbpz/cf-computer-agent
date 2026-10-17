"use client";
// beui.dev/components/motion/morphing-modal
//
// §17 controlled-localization patches (slug: morphing-modal):
// 1. labels — `backdropLabel` names the backdrop control (was the hardcoded
//    `aria-label="Close modal"`). The adapter passes the caller's localized
//    dismiss text.
// 2. attributes — `panelProps`/`panelRef` reach the panel element (role,
//    aria-*, `data-*-dialog` hooks, tabIndex) and `backdropProps` reaches the
//    backdrop (`data-dialog-backdrop`), so the same addressing the dialog suites
//    already use keeps working. The payload has no focus scope of its own; the
//    adapter's `useFocusScope` is the one owner, exactly as for
//    `center-morph-modal`.
//
// What this file is for: the app's *changing* panels. `center-morph-modal` is
// the app's modal shape; this payload is the beUI source for a single panel
// whose height morphs as its inner view changes (the planning composers move
// editing → write → readback/recovery in one surface). Its `layout` panel and
// `popLayout` content cross-fade are the payload's behaviour and are unchanged.
//
// Design lock applied in place: `rounded-3xl` becomes the theme's `--radius`
// (`rounded-lg`), so the panel stays on the app's single radius scale.

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";
import { type AriaRole, type CSSProperties, type ReactNode, useEffect } from "react";
import { EASE_OUT, SPRING_PANEL } from "../../lib/ease";
import { PresenceGate } from "../../lib/presence-gate";
import { cn } from "../../lib/utils";

export interface MorphingModalPanelProps {
  role?: AriaRole;
  tabIndex?: number;
  style?: CSSProperties;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-modal"?: boolean;
  [attribute: `data-${string}`]: unknown;
}

export interface MorphingModalProps {
  /** Which view is currently shown. `null` closes the modal. */
  viewId: string | null;
  onClose: () => void;
  children: ReactNode;
  /** "bottom" anchors to the viewport bottom (mobile-like). "center" centers vertically. */
  placement?: "bottom" | "center";
  /** [patch 1] Accessible name of the backdrop control that dismisses the panel. */
  backdropLabel: string;
  /** [patch 2] Attributes for the panel element. */
  panelProps?: MorphingModalPanelProps;
  /** [patch 2] The panel node, for an owner that runs its own focus scope. */
  panelRef?: (node: HTMLDivElement | null) => void;
  className?: string;
}

export function MorphingModal({
  viewId,
  onClose,
  children,
  placement = "bottom",
  backdropLabel,
  panelProps,
  panelRef,
  className,
}: MorphingModalProps) {
  const open = viewId !== null;
  const reduce = useReducedMotion();
  const enterY = reduce ? 0 : placement === "bottom" ? 40 : 20;
  const enterScale = reduce ? 1 : 0.97;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Mounted only while open, and while open the chrome is two fixed siblings
  // rather than one wrapper: the backdrop spans the viewport edges but carries
  // the scrim colour, and the layer positioning the panel sits inset off every
  // edge (`inset-4`, with the bottom placement's `pb-4` on top of it). Both hang
  // off `PresenceGate`, so interaction releases in the same commit that starts
  // the exit rather than when it ends — `open` is already false for those
  // frames.
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <PresenceGate key="backdrop">
          {({ gate }) => (
            <motion.button
              type="button"
              aria-label={backdropLabel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              {...gate}
              onClick={onClose}
              className="pointer-events-auto fixed inset-0 z-[80] bg-background/5 [backdrop-filter:blur(14px)_saturate(140%)] [-webkit-backdrop-filter:blur(14px)_saturate(140%)]"
            />
          )}
        </PresenceGate>
      ) : null}

      {open ? (
        <PresenceGate key="panel-layer">
          {({ isPresent, gate }) => (
            // The layer itself never takes pointer events, so it carries
            // `inert` alone rather than the gate's pointer-events value.
            <div
              inert={!isPresent}
              className={cn(
                "pointer-events-none fixed inset-4 z-[80] flex justify-center",
                placement === "bottom" ? "items-end pb-4" : "items-center",
              )}
            >
              <motion.div
                key="panel"
                ref={panelRef}
                layout
                role={panelProps?.role ?? "dialog"}
                tabIndex={panelProps?.tabIndex ?? -1}
                initial={{ opacity: 0, y: enterY, scale: enterScale }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  y: enterY,
                  scale: reduce ? 1 : 0.98,
                  transition: { duration: 0.18, ease: EASE_OUT },
                }}
                transition={SPRING_PANEL}
                {...gate}
                {...panelProps}
                className={cn(
                  "pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-lg border border-border bg-background shadow-2xl will-change-transform",
                  className,
                )}
              >
                <motion.div layout="position" className="p-5">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.div
                      key={viewId}
                      initial={
                        reduce
                          ? { opacity: 0 }
                          : { opacity: 0, y: 8, filter: "blur(4px)" }
                      }
                      animate={
                        reduce
                          ? {
                              opacity: 1,
                              transition: {
                                duration: 0.18,
                                ease: EASE_OUT,
                              },
                            }
                          : {
                              opacity: 1,
                              y: 0,
                              filter: "blur(0px)",
                              transition: {
                                duration: 0.24,
                                ease: EASE_OUT,
                              },
                            }
                      }
                      exit={
                        reduce
                          ? {
                              opacity: 0,
                              transition: {
                                duration: 0.14,
                                ease: EASE_OUT,
                              },
                            }
                          : {
                              opacity: 0,
                              y: -8,
                              filter: "blur(4px)",
                              transition: {
                                duration: 0.16,
                                ease: EASE_OUT,
                              },
                            }
                      }
                    >
                      {children}
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            </div>
          )}
        </PresenceGate>
      ) : null}
    </AnimatePresence>
  );
}
