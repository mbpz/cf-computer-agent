"use client";
// beui.dev/components/motion/slide-action-button
//
// §17 controlled-localization patches (slug: slide-action-button):
// 1. labels — `ariaLabel` names the thumb (the payload only names it when
//    `children` is a string); the typed-confirmation gate passes the same
//    localized confirm label the button used to render.
// 2. attributes — `thumbProps` lands on the thumb `<button>`, so
//    `data-confirm-action` stays on the element the suites click/assert on, and
//    `disabled` is a real state of that button (the typed gate disables it
//    until the typed value matches — `test/unit/frontend-admin-asset-hygiene
//    .test.tsx:186`).
// 4. callback — `onActivate` completes from a plain click/keyboard activation
//    even before the track has been measured (the payload guards `complete()`
//    on `maxDistance`, which is 0 outside a laid-out browser and would make the
//    click-to-confirm contract untestable and unreachable in a narrow rail).
//
// Design lock applied in place: the track/thumb radii come from the theme's
// `--radius` scale instead of a second 22px/18px scale; colours were already
// tokens. Gesture, threshold and reset timing are unchanged.

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { EASE_OUT, SPRING_LAYOUT, SPRING_PRESS } from "../../lib/ease";
import { TOUCH_GESTURE_CLASS, TOUCH_GESTURE_CONTENT_CLASS } from "../../lib/touch";
import { cn } from "../../lib/utils";

export interface SlideActionButtonProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> {
  children: ReactNode;
  completeLabel?: ReactNode;
  threshold?: number;
  resetDelay?: number;
  onComplete?: () => void;
  /** [patch 4] Plain activation completes without a drag. */
  onActivate?: () => void;
  /** [patch 2] The thumb's accessible name. */
  ariaLabel?: string;
  /** [patch 2] Disabled state of the thumb control. */
  disabled?: boolean;
  /** [patch 2] Attributes for the thumb `<button>` (`data-confirm-action`). */
  thumbProps?: {
    id?: string;
    "aria-describedby"?: string;
    [attribute: `data-${string}`]: string | boolean | undefined;
  };
  thumbClassName?: string;
  fillClassName?: string;
}

export function SlideActionButton({
  children,
  completeLabel = "Complete",
  threshold = 0.82,
  resetDelay = 1200,
  onComplete,
  onActivate,
  ariaLabel,
  disabled = false,
  thumbProps,
  thumbClassName,
  fillClassName,
  className,
  ...rest
}: SlideActionButtonProps) {
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLButtonElement>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const completedRef = useRef(false);
  const x = useMotionValue(0);
  const [maxDistance, setMaxDistance] = useState(0);
  const [completed, setCompleted] = useState(false);
  const safeDistance = Math.max(maxDistance, 1);
  const dragProgress = useTransform(x, [0, safeDistance], [0, 1]);
  const fillProgress = useTransform(x, [0, safeDistance], [0, 1]);
  const labelOpacity = useTransform(
    x,
    [0, safeDistance * 0.35, safeDistance * 0.65],
    [1, 0.75, 0],
  );
  const iconPath = useTransform(
    dragProgress,
    [0, 0.5, 1],
    [
      "M 8 5 L 15 12 L 8 19",
      "M 7 8 L 12 14 L 17 10",
      "M 5 12 L 10 17 L 19 7",
    ],
  );

  useLayoutEffect(() => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return;

    const measure = () => {
      setMaxDistance(Math.max(track.clientWidth - thumb.clientWidth - 8, 0));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    observer.observe(thumb);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const moveTo = (target: number) => {
    if (reduce) {
      x.set(target);
      return;
    }
    animate(x, target, SPRING_LAYOUT);
  };

  const reset = () => {
    completedRef.current = false;
    setCompleted(false);
    moveTo(0);
  };

  const complete = () => {
    if (completedRef.current || maxDistance === 0 || disabled) return;
    completedRef.current = true;
    setCompleted(true);
    moveTo(maxDistance);
    onComplete?.();

    clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(reset, resetDelay);
  };

  // [patch 4] A plain click/Enter completes even when the track has no
  // measured width (hidden panel, narrow rail, non-layout test DOM), which is
  // exactly the contract the typed confirmation has always had.
  const activate = () => {
    if (completedRef.current || disabled) return;
    completedRef.current = true;
    setCompleted(true);
    moveTo(maxDistance);
    if (onActivate) onActivate();
    else onComplete?.();

    clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(reset, resetDelay);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (maxDistance === 0) activate();
    else complete();
  };

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative h-16 w-72 overflow-hidden rounded-lg bg-muted p-1",
        "ring-1 ring-primary/10",
        // The track only carries the label — the slide starts on the thumb,
        // which suppresses selection for the whole gesture on its own.
        TOUCH_GESTURE_CONTENT_CLASS,
        disabled && "opacity-50",
        className,
      )}
      {...rest}
    >
      <motion.span
        aria-hidden="true"
        style={{ scaleX: fillProgress }}
        className={cn(
          "absolute inset-0 origin-left bg-primary will-change-transform",
          fillClassName,
        )}
      />

      <motion.span
        aria-hidden="true"
        style={{ opacity: labelOpacity }}
        className="pointer-events-none absolute inset-0 grid place-items-center pl-10 text-sm font-medium text-foreground"
      >
        {children}
      </motion.span>

      <motion.span
        aria-live="polite"
        animate={{ opacity: completed ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 0.15, ease: EASE_OUT }}
        className="pointer-events-none absolute inset-0 grid place-items-center text-sm font-medium text-primary-foreground"
      >
        {completed ? completeLabel : null}
      </motion.span>

      <motion.button
        ref={thumbRef}
        type="button"
        aria-label={ariaLabel ?? (typeof children === "string" ? children : "Slide action")}
        disabled={disabled}
        {...thumbProps}
        drag={completed || disabled ? false : "x"}
        dragConstraints={{ left: 0, right: maxDistance }}
        dragElastic={0}
        dragMomentum={false}
        style={{ x }}
        onClick={activate}
        onDragEnd={() => {
          if (x.get() >= maxDistance * threshold) complete();
          else moveTo(0);
        }}
        onKeyDown={handleKeyDown}
        whileTap={reduce || completed || disabled ? undefined : { scale: 0.94 }}
        transition={SPRING_PRESS}
        className={cn(
          "relative z-10 grid size-14 touch-none cursor-grab place-items-center rounded-md bg-primary text-primary-foreground shadow-sm",
          TOUCH_GESTURE_CLASS,
          "outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:pointer-events-none disabled:opacity-50",
          completed && "cursor-default bg-background text-foreground",
          thumbClassName,
        )}
      >
        <motion.svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
          <motion.path
            d={iconPath}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </motion.svg>
      </motion.button>
    </div>
  );
}
