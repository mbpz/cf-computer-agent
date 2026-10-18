"use client";
// beui.dev/components/motion/scroll-animation (scroll-progress bar)
//
// Local adaptation of the registry payload. The payload's default progress source
// is the optional Lenis smooth-scroll provider, which this app does not install;
// this bar reads the native scroll source instead. The shell scrolls `main`
// rather than the document on desktop, so the caller may name that container and
// the element whose reading progress is reported; both fall back to the window.

import {
  type MotionValue,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
} from "motion/react";
import { useEffect, useMemo, useState, type RefObject } from "react";
import { cn } from "../../lib/utils";

// Soft follow so the indicator trails the scroll smoothly instead of snapping;
// looser than the UI springs in lib/ease.ts on purpose.
const PROGRESS_SPRING = { stiffness: 120, damping: 30, mass: 0.6 };

export interface ScrollProgressProps {
  /** Override the scroll source. Defaults to the selected container's scroll. */
  progress?: MotionValue<number>;
  /** Element whose visible progress is reported; defaults to the whole container. */
  target?: RefObject<HTMLElement | null>;
  /** The app's content scroller. Ignored when the element does not actually scroll. */
  containerSelector?: string;
  /** Spring-smooth the value. Disabled automatically under reduced motion. */
  spring?: boolean;
  className?: string;
  position?: "top" | "bottom";
  /** Bar thickness in px. */
  height?: number;
  /** Position the bar with `fixed` (page) or `absolute` (embedded). */
  fixed?: boolean;
}

/** The shell scrolls `main` only at desktop widths; below that the window scrolls. */
function useScrollContainer(selector: string): HTMLElement | undefined {
  const [container, setContainer] = useState<HTMLElement>();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const node = document.querySelector<HTMLElement>(selector);
    if (!node) {
      setContainer(undefined);
      return;
    }
    const update = () => {
      setContainer(/(auto|scroll)/u.test(getComputedStyle(node).overflowY) ? node : undefined);
    };
    update();
    const query = typeof window.matchMedia === "function"
      ? window.matchMedia("(min-width: 1024px)")
      : null;
    query?.addEventListener?.("change", update);
    return () => query?.removeEventListener?.("change", update);
  }, [selector]);

  return container;
}

export function ScrollProgress({
  progress,
  target,
  containerSelector = "[data-shell-content-scroll]",
  spring = true,
  position = "top",
  height = 2,
  fixed = true,
  className,
}: ScrollProgressProps) {
  const reduce = useReducedMotion();
  const container = useScrollContainer(containerSelector);
  const containerRef = useMemo<RefObject<HTMLElement | null> | undefined>(
    () => (container ? { current: container } : undefined),
    [container],
  );
  const { scrollYProgress } = useScroll({
    ...(containerRef ? { container: containerRef } : {}),
    ...(target ? { target, offset: ["start start", "end end"] as const } : {}),
  });
  const raw = progress ?? scrollYProgress;
  const smoothed = useSpring(raw, PROGRESS_SPRING);
  const value = spring && !reduce ? smoothed : raw;

  return (
    <motion.div
      aria-hidden
      style={{ height, scaleX: value }}
      className={cn(
        "left-0 right-0 z-50 origin-left bg-primary",
        fixed ? "fixed" : "absolute",
        position === "top" ? "top-0" : "bottom-0",
        className,
      )}
    />
  );
}
