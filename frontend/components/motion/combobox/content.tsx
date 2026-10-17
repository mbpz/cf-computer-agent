"use client";
// beui.dev/components/motion/combobox/content
//
// §17 localization-fork patches (docs/product/2026-10-17-beui-full-adoption-matrix.md §17):
//   2. attribute passthrough — `inline` places the panel in the field instead of a body
//      portal, and `...rest` lands on the panel element. The open/close spring, the
//      `aria-hidden`/`inert` closed state and the pointer-events gate are the payload's own;
//      only the placement (portal vs. field) and the caller's attributes are added.
//
// Contract preserved: options stay inside the filter field, so
// `trigger.parentElement.querySelectorAll('[role="option"]')` still addresses them
// (test/unit/frontend-tasks-page.test.tsx:143,167; test/unit/frontend-graph-page.test.tsx:863)
// and the row inside a mobile bottom sheet never escapes to `document.body`.

import { motion, type HTMLMotionProps, type Transition } from "motion/react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { usePopoverPortalPosition } from "../popover-position";
import { cn } from "../../../lib/utils";
import { useComboboxContext } from "./context";

type Side = "top" | "bottom";
type Align = "start" | "center" | "end";

// The panel uses one weighted spring for both directions, so opening and
// closing travel through the same detached geometry.
const COMBOBOX_MORPH: Transition = {
  type: "spring",
  duration: 0.5,
  bounce: 0.22,
};
const VIEWPORT_PADDING = 8;

export interface ComboboxContentProps
  extends Omit<HTMLMotionProps<"div">, "children" | "ref"> {
  children: ReactNode;
  side?: Side;
  align?: Align;
  sideOffset?: number;
  avoidCollisions?: boolean;
  /**
   * Render the panel inside the field instead of a `document.body` portal. The filter row
   * needs this: it is addressed from its trigger's parent, and it can sit in a mobile
   * bottom sheet, which a body portal would escape.
   */
  inline?: boolean;
}

export function ComboboxContent({
  children,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  avoidCollisions = true,
  className,
  inline = false,
  ...rest
}: ComboboxContentProps) {
  const context = useComboboxContext("ComboboxContent");
  const measureRef = useRef<HTMLDivElement>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [actualSide, setActualSide] = useState<Side>(side);
  const [morphReady, setMorphReady] = useState(false);
  const layout = usePopoverPortalPosition(
    context.triggerRef,
    measureRef,
    portalReady,
  );

  useEffect(() => setPortalReady(true), []);
  useLayoutEffect(() => {
    if (!portalReady) return;
    const readyFrame = requestAnimationFrame(() => setMorphReady(true));
    return () => cancelAnimationFrame(readyFrame);
  }, [portalReady]);

  useLayoutEffect(() => {
    // Preserve the resolved side during exit, so top panels close upward.
    if (!context.open || !layout) return;
    if (!avoidCollisions) {
      setActualSide(side);
      return;
    }
    const below =
      window.innerHeight - (layout.trigger.top + layout.trigger.height);
    const above = layout.trigger.top;
    if (
      side === "bottom" &&
      below < layout.content.height + sideOffset &&
      above > below
    )
      setActualSide("top");
    else if (
      side === "top" &&
      above < layout.content.height + sideOffset &&
      below > above
    )
      setActualSide("bottom");
    else setActualSide(side);
  }, [avoidCollisions, context.open, layout, side, sideOffset]);

  if (inline) {
    return (
      <motion.div
        {...rest}
        ref={context.contentRef}
        data-combobox-content=""
        data-inline=""
        aria-hidden={!context.open}
        inert={!context.open}
        initial={false}
        animate={{
          height: context.open ? "auto" : 0,
          opacity: context.open ? 1 : 0,
          y: context.open ? 0 : -4,
        }}
        transition={
          context.reduce || !morphReady ? { duration: 0 } : COMBOBOX_MORPH
        }
        style={{
          pointerEvents: context.open ? "auto" : "none",
          transformOrigin: "top",
        }}
        className={cn(
          "absolute top-full left-0 z-20 mt-1.5 w-full min-w-56 overflow-hidden rounded-lg border border-border bg-background text-popover-foreground outline-none",
          "max-h-80 overflow-y-auto",
          className,
        )}
      >
        {children}
      </motion.div>
    );
  }

  if (!portalReady) return null;

  const triggerLeft = layout?.trigger.left ?? 0;
  const triggerWidth = layout?.trigger.width ?? 0;
  const contentWidth = layout?.content.width ?? triggerWidth;
  const desiredLeft =
    align === "end"
      ? triggerLeft + triggerWidth - contentWidth
      : align === "center"
        ? triggerLeft + (triggerWidth - contentWidth) / 2
        : triggerLeft;
  const maxLeft = Math.max(
    VIEWPORT_PADDING,
    window.innerWidth - contentWidth - VIEWPORT_PADDING,
  );
  const left = Math.min(Math.max(desiredLeft, VIEWPORT_PADDING), maxLeft);
  const surfaceHeight = layout?.content.height ?? 0;

  return createPortal(
    <motion.div
      {...rest}
      ref={context.contentRef}
      data-combobox-content=""
      data-side={actualSide}
      aria-hidden={!context.open}
      inert={!context.open}
      initial={false}
      animate={{
        height: context.open ? surfaceHeight : 0,
        opacity: context.open ? 1 : 0,
        y: context.open
          ? actualSide === "bottom"
            ? sideOffset
            : -sideOffset
          : 0,
      }}
      transition={
        context.reduce || !morphReady ? { duration: 0 } : COMBOBOX_MORPH
      }
      style={
        {
          left,
          top:
            actualSide === "bottom" && layout
              ? layout.trigger.top + layout.trigger.height
              : undefined,
          bottom:
            actualSide === "top" && layout
              ? window.innerHeight - layout.trigger.top
              : undefined,
          minWidth: triggerWidth,
          pointerEvents: context.open ? "auto" : "none",
          transformOrigin: actualSide === "bottom" ? "top" : "bottom",
          visibility: layout ? "visible" : "hidden",
          "--combobox-trigger-width": `${triggerWidth}px`,
        } as CSSProperties
      }
      className={cn(
        "fixed z-[9999] w-(--combobox-trigger-width) overflow-hidden rounded-lg border border-border bg-background text-popover-foreground outline-none will-change-[height,transform]",
        className,
      )}
    >
      <motion.div
        ref={measureRef}
        initial={false}
        animate={{ opacity: context.open ? 1 : 0 }}
        transition={
          context.reduce || !morphReady ? { duration: 0 } : COMBOBOX_MORPH
        }
      >
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  );
}
