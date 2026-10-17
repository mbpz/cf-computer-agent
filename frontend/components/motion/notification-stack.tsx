"use client";
// beui.dev/components/blocks/notification-stack
//
// RFC 2119 local patches — §17 controlled localization-fork policy
// (docs/product/2026-10-17-beui-full-adoption-matrix.md §17). Payload:
// https://beui.dev/r/notification-stack.json, `components/motion/notification-stack.tsx`.
// Patch 1 (attribute + slot passthrough): `NotificationStackItem` gained
//   `data` (spread onto the same card element) and `actions` (row controls
//   rendered inside the card), so `data-notification-id` / `data-read` stay on
//   the row (`frontend/pages/notifications/notifications-page.tsx:111`;
//   asserted at `test/unit/frontend-notifications-page.test.tsx:100-101` and
//   `test/unit/frontend-notifications-route.test.tsx:631-632`).
// Patch 2 (interaction control): `interactive` disables the payload's whole
//   stack `<motion.button>` (hover/tap expansion, outside-tap dismissal,
//   `onViewAll`) and renders a labelled `role="list"` surface with every row
//   expanded, so per-row Open / Mark read can be real buttons. The animation
//   primitives used by the interactive mode are untouched.
// Patch 3 (footer slot): `footer` renders in the stack's own footer row, so
//   the 20/50/100 `DataPagination` lives inside the component instead of in a
//   second list host (`frontend/components/data-pagination.tsx:39`).
// Patch 4 (localization): the hardcoded English aria templates
//   (`${n} notifications. …`, payload `:238-242`) are required `labels`
//   callbacks; `collapsedLabel` / `expandedLabel` / `emptyLabel` remain the
//   visible strings. Preserves both-locale copy (`AGENT`-independent:
//   `NOTIFICATIONS_TITLE`, `COMMON_DISMISS`).
// Style tokens are the repo's: `rounded-2xl/3xl` collapses to the `--radius`
//   scale and the orange count pill becomes `bg-primary`.
// The empty state stays the page's `PageState`; this component only mirrors it
// when mounted standalone.

import { ArrowUpRight, BellSlash } from "@phosphor-icons/react";
import { motion, type Transition, useReducedMotion } from "motion/react";
import {
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import { ActionSwapText } from "./action-swap";
import { EASE_OUT, SPRING_LAYOUT } from "../../lib/ease";
import { useDismiss } from "../../lib/hooks/use-dismiss";
import { useHoverGesture } from "../../lib/hooks/use-hover-gesture";
import { useTapGesture } from "../../lib/hooks/use-tap-gesture";
import { cn } from "../../lib/utils";

export type NotificationStackItem = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  /** Row-level data hooks (`data-notification-id`, `data-read`, …). */
  data?: Record<string, string>;
  /** Per-row controls; only rendered when `interactive` is `false`. */
  actions?: ReactNode;
};

export type NotificationStackClassNames = {
  stack?: string;
  card?: string;
  content?: string;
  title?: string;
  description?: string;
  trailing?: string;
  footer?: string;
  count?: string;
};

export interface NotificationStackLabels {
  /** Accessible name for the expanded interactive stack. */
  expanded: (count: number) => string;
  /** Accessible name for the collapsed interactive stack. */
  collapsed: (count: number) => string;
}

export interface NotificationStackProps {
  items: NotificationStackItem[];
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onViewAll?: () => void;
  maxVisible?: number;
  collapsedLabel?: string;
  expandedLabel?: string;
  emptyLabel?: string;
  /** Accessible name of the static list surface. */
  ariaLabel?: string;
  /** Required for interactive mode: the aria templates the payload hardcodes. */
  labels: NotificationStackLabels;
  /** Footer row content (e.g. the page pager). Replaces the count/label row. */
  footer?: ReactNode;
  /** `false` renders every item as a static list row (row actions allowed). */
  interactive?: boolean;
  className?: string;
  classNames?: NotificationStackClassNames;
}

const STACK_PEEK = 8;
const STACK_INSET = 12;

function useControllableExpanded({
  expanded,
  defaultExpanded,
  onExpandedChange,
}: {
  expanded?: boolean;
  defaultExpanded: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = expanded !== undefined;
  const value = expanded ?? internalExpanded;

  const setValue = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalExpanded(next);
      onExpandedChange?.(next);
    },
    [isControlled, onExpandedChange],
  );

  return [value, setValue] as const;
}

function NotificationCardContent({
  item,
  classNames,
}: {
  item: NotificationStackItem;
  classNames?: NotificationStackClassNames;
}) {
  return (
    <span
      className={cn(
        "flex min-w-0 flex-col gap-1.5 py-4",
        classNames?.content,
      )}
    >
      <span className="flex min-w-0 items-start justify-between gap-3">
        <span
          className={cn(
            "min-w-0 text-sm font-medium leading-snug",
            classNames?.title,
          )}
        >
          {item.title}
        </span>
        {item.trailing ? (
          <span
            className={cn("shrink-0 text-xs", classNames?.trailing)}
          >
            {item.trailing}
          </span>
        ) : null}
      </span>
      {item.description ? (
        <span
          className={cn(
            "text-xs leading-relaxed text-muted-foreground",
            classNames?.description,
          )}
        >
          {item.description}
        </span>
      ) : null}
      {item.actions ? (
        <span className="mt-1 flex flex-wrap items-center gap-2">
          {item.actions}
        </span>
      ) : null}
    </span>
  );
}

export function NotificationStack({
  items,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  onViewAll,
  maxVisible = 3,
  collapsedLabel = "Notifications",
  expandedLabel = "View all",
  emptyLabel = "All caught up",
  ariaLabel,
  labels,
  footer,
  interactive = true,
  className,
  classNames,
}: NotificationStackProps) {
  const reduce = useReducedMotion();
  const hasFocus = useRef(false);
  const rootRef = useRef<HTMLButtonElement>(null);
  const hover = useHoverGesture();
  // What the last gesture on the stack was, and whether it was already
  // expanded when that gesture started. A click reports neither.
  const tap = useTapGesture<boolean>();
  const [isExpandedValue, setIsExpanded] = useControllableExpanded({
    expanded,
    defaultExpanded,
    onExpandedChange,
  });
  // Static mode has no gestures: every row is always in its expanded slot.
  const isExpanded = interactive ? isExpandedValue : true;
  // Set by the tap that expands the stack, and the reason the outside-tap
  // dismisser exists at all — a hovering pointer has its own way out.
  const [tapExpanded, setTapExpanded] = useState(false);

  const collapse = useCallback(() => {
    setTapExpanded(false);
    setIsExpanded(false);
  }, [setIsExpanded]);

  // A pointer leaving the stack is what collapses it, and a finger never
  // leaves: without this the stack stays open for good once tapped, and when
  // `onViewAll` is set the next tap follows the link instead of closing. The
  // tap that lands somewhere else stands in for the pointer leaving, and it is
  // consumed rather than passed through — the expanded stack covers the page,
  // so the tap that dismisses it is aimed at nothing else.
  useDismiss(interactive && tapExpanded && isExpanded, collapse, rootRef, {
    behavior: "consume",
  });

  const visibleItems = interactive
    ? items.slice(0, Math.max(1, maxVisible))
    : items;
  const primaryItem = visibleItems[0];
  const transition: Transition = reduce ? { duration: 0 } : SPRING_LAYOUT;
  const cardTransition: Transition = reduce
    ? { duration: 0 }
    : { duration: 0.32, ease: EASE_OUT };
  const backgroundTransition: Transition = reduce
    ? { duration: 0 }
    : { duration: 0.26, ease: EASE_OUT };

  if (!primaryItem) {
    return (
      <div
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-lg bg-muted/70 px-5 py-8 text-sm font-medium text-muted-foreground",
          className,
        )}
      >
        <BellSlash className="h-4 w-4" aria-hidden="true" />
        {emptyLabel}
      </div>
    );
  }

  const footerContent = footer ?? (
    <>
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground shadow-[inset_0_1px_2px_rgb(0_0_0/0.2),inset_0_-1px_0_rgb(255_255_255/0.16)]",
          classNames?.count,
        )}
      >
        {items.length}
      </span>
      <span className="flex items-center text-sm font-medium">
        <ActionSwapText
          value={isExpanded ? "expanded" : "collapsed"}
          animation="roll"
        >
          {isExpanded ? (
            <span className="inline-flex items-center gap-1">
              {expandedLabel}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </span>
          ) : (
            collapsedLabel
          )}
        </ActionSwapText>
      </span>
    </>
  );

  if (!interactive) {
    return (
      <div
        data-notification-stack="static"
        className={cn(
          "relative z-10 block w-full rounded-lg text-left text-foreground",
          className,
        )}
      >
        <span
          aria-label={ariaLabel}
          role="list"
          className={cn("grid gap-1", classNames?.stack)}
        >
          {visibleItems.map((item) => (
            <span
              key={item.id}
              role="listitem"
              {...item.data}
              className={cn(
                "block rounded-lg border border-border/60 bg-background px-4",
                classNames?.card,
              )}
            >
              <NotificationCardContent item={item} classNames={classNames} />
            </span>
          ))}
        </span>
        {/* The interactive stack owns the count/label row; the static list
            only grows a footer when the caller supplies one (the pager). */}
        {footer !== undefined ? (
          <div
            className={cn(
              "relative z-10 mt-2 flex min-h-9 flex-wrap items-center gap-2 border-t px-1 pt-3",
              classNames?.footer,
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    );
  }

  const handleBlur = (event: FocusEvent<HTMLButtonElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    hasFocus.current = false;
    collapse();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // A key press is the start of a keyboard activation, never part of a tap:
    // whatever a taken-away gesture left behind must not be read as one.
    tap.drop();
    if (event.key !== "Escape") return;
    event.preventDefault();
    collapse();
    // Focus stays where the keyboard put it. Blurring here collapsed the stack
    // *and* threw the user back to the top of the document.
  };

  const handleClick = () => {
    const gesture = tap.take();
    // Read from where the gesture started, not from now: a browser that
    // focuses the stack on contact expands it mid-tap, and the first tap would
    // then follow `onViewAll` instead of opening the list it was meant to.
    const wasExpanded = gesture ? gesture.state : isExpandedValue;

    if (!wasExpanded) {
      setIsExpanded(true);
      if (gesture && gesture.pointerType !== "mouse") setTapExpanded(true);
      return;
    }

    if (onViewAll) {
      onViewAll();
      return;
    }

    collapse();
  };

  return (
    <motion.button
      ref={rootRef}
      type="button"
      initial={false}
      aria-expanded={isExpandedValue}
      aria-label={
        isExpandedValue
          ? labels.expanded(items.length)
          : labels.collapsed(items.length)
      }
      // A tap reports as a hover on its way past — enter, leave, then click —
      // so an unfiltered hover path expands, collapses and expands again in
      // the space of one tap, springs and all. The tap has its own route
      // through `handleClick`.
      onPointerEnter={(event: PointerEvent<HTMLButtonElement>) => {
        if (hover.enter(event)) setIsExpanded(true);
      }}
      onPointerLeave={(event: PointerEvent<HTMLButtonElement>) => {
        if (hover.leave(event) && !hasFocus.current) collapse();
      }}
      onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
        tap.start(event, isExpandedValue);
      }}
      // The platform can take the gesture away mid-press — a scroll, a system
      // swipe — and no click follows it.
      onPointerCancel={tap.drop}
      onFocus={() => {
        hasFocus.current = true;
        setIsExpanded(true);
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      className={cn(
        "relative z-10 block w-full max-w-[22rem] cursor-pointer rounded-lg text-left text-foreground outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      {/* This invisible first card gives the button its compact intrinsic footprint. */}
      <span aria-hidden="true" className="invisible block p-3">
        <span className="block">
          <span
            className={cn(
              "block rounded-lg border border-transparent px-4",
              classNames?.card,
            )}
          >
            <NotificationCardContent
              item={primaryItem}
              classNames={classNames}
            />
          </span>
        </span>
        <span className="mt-2 block h-9" />
      </span>

      <span className="absolute inset-x-0 bottom-0 block p-3">
        <motion.span
          aria-hidden="true"
          layout
          initial={false}
          transition={backgroundTransition}
          className="absolute inset-0 rounded-lg bg-muted"
        />
        <span
          className={cn(
            "relative z-10 grid gap-1",
            !isExpandedValue && "pb-2",
            classNames?.stack,
          )}
        >
          {visibleItems.map((item, index) => {
            const isPrimary = index === 0;

            return (
              <motion.span
                key={item.id}
                layout="position"
                initial={false}
                animate={{
                  y: isExpandedValue ? 0 : index * STACK_PEEK,
                  clipPath: isExpandedValue
                    ? "inset(0px 0px round 16px)"
                    : `inset(0px ${index * STACK_INSET}px round 16px)`,
                }}
                transition={cardTransition}
                className={cn(
                  "block rounded-lg border border-border/60 bg-background px-4",
                  classNames?.card,
                )}
                style={{
                  zIndex: visibleItems.length - index,
                  gridColumn: 1,
                  gridRow: isExpandedValue ? index + 1 : 1,
                }}
                {...item.data}
              >
                <span
                  className={cn(
                    "block",
                    !isPrimary && !isExpandedValue && "invisible",
                  )}
                >
                  <NotificationCardContent
                    item={item}
                    classNames={classNames}
                  />
                </span>
              </motion.span>
            );
          })}
        </span>

        <motion.span
          layout="position"
          transition={transition}
          className={cn(
            "relative z-10 mt-2 flex min-h-9 items-center gap-2 px-1",
            classNames?.footer,
          )}
        >
          {footerContent}
        </motion.span>
      </span>
    </motion.button>
  );
}
