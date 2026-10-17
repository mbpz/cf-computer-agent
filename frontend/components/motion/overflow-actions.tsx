"use client";
// beui.dev/components/blocks/overflow-actions
//
// §17 controlled-localization patches (slug: overflow-actions):
// 1. labels — `openLabel`/`closeLabel` already exist as props; every rail
//    passes localized text, so the toggle is never announced in English.
// 2. attributes — `OverflowActionItem.attributes` lands on the item's own
//    `<button>`, so the row hooks the suites and the pages address keep
//    selecting the exact control: `data-menu-edit-open` on the menu row edit
//    action (`test/unit/admin-menus-page.test.tsx` queries the row wrapper for
//    its Delete control), `id="manage-goal-tasks-<id>"` on the goals row
//    (`test/unit/frontend-goals-page.test.tsx:25`), the `aria-label` that names
//    a duplicate/review decision for the exact target
//    (`test/unit/frontend-review-confirmation.test.tsx:85`), and the
//    `aria-expanded`/`aria-busy` state the review rail reports.
// 3. slots — `primaryActions`/`overflowActions` are the row-action slot; the
//    overflow group only renders (and its toggle only exists) when the caller
//    actually passes extra actions, so a rail with three primary controls does
//    not ship an inert disclosure.
// 4. callbacks — unchanged (`onAction`, `onExpandedChange`).
//
// `tone` is the one styling addition: beUI paints every action the same, and
// the app's destructive controls must stay visually distinct (the reason this
// payload was declined in wave 1). It only swaps palette classes inside the
// existing token set. Design lock: the toggle and actions keep `--radius`
// (rounded-full pills) and gain `max-sm:min-h-11` so the coarse-pointer floor
// is not lowered by the 32px desktop rail.

import { DotsThree, X } from "@phosphor-icons/react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
  type Variants,
} from "motion/react";
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { EASE_OUT } from "../../lib/ease";
import { useHoverCapable } from "../../lib/hooks/use-hover-capable";
import { cn } from "../../lib/utils";

export type OverflowActionsSize = "sm" | "md";

/** [patch 2] The attributes a row action needs to stay addressable. */
export type OverflowActionAttributes = {
  id?: string;
  title?: string;
  "aria-label"?: string;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  "aria-haspopup"?: "dialog" | "menu" | "listbox";
  "aria-busy"?: boolean;
  [attribute: `data-${string}`]: string | boolean | undefined;
};

export type OverflowActionItem = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  onClick?: (event?: ReactMouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  ariaLabel?: string;
  /** [patch 4] Visual weight: destructive actions keep their own palette. */
  tone?: "default" | "destructive";
  /** [patch 2] Attributes for this action's button element. */
  attributes?: OverflowActionAttributes;
};

export type OverflowActionsClassNames = {
  root?: string;
  track?: string;
  action?: string;
  primaryAction?: string;
  overflowAction?: string;
  toggle?: string;
  icon?: string;
  label?: string;
};

export interface OverflowActionsProps {
  primaryActions: OverflowActionItem[];
  overflowActions?: OverflowActionItem[];
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onAction?: (item: OverflowActionItem) => void;
  collapseOnAction?: boolean;
  size?: OverflowActionsSize;
  openLabel: string;
  closeLabel: string;
  className?: string;
  classNames?: OverflowActionsClassNames;
}

// This needs a softer layout spring than the app defaults so the overflow group
// stays visually attached to the toggle while entering and leaving.
const SHELL_TRANSITION: Transition = {
  type: "spring",
  stiffness: 220,
  damping: 17,
  mass: 0.85,
};

const ICON_VARIANTS: Variants = {
  hidden: { opacity: 0, filter: "blur(3px)" },
  visible: {
    opacity: 1,
    filter: "blur(0px)",
    transition: { duration: 0.18, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    filter: "blur(3px)",
    transition: { duration: 0.18, ease: EASE_OUT },
  },
};

const OVERFLOW_ACTION_VARIANTS: Variants = {
  hidden: { opacity: 0, filter: "blur(4px)" },
  visible: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(4px)" },
};

const TRACK_SIZE_CLASS: Record<OverflowActionsSize, string> = {
  sm: "gap-1 p-1 text-xs",
  md: "gap-1.5 p-1.5 text-sm",
};

const GROUP_GAP_CLASS: Record<OverflowActionsSize, string> = {
  sm: "gap-1",
  md: "gap-1.5",
};

const ACTION_SIZE_CLASS: Record<OverflowActionsSize, string> = {
  sm: "h-8 min-w-8 gap-1.5 px-3 max-sm:min-h-11",
  md: "h-9 min-w-9 gap-2 px-3.5 max-sm:min-h-11",
};

const TOGGLE_SIZE_CLASS: Record<OverflowActionsSize, string> = {
  sm: "h-8 w-8 max-sm:h-11 max-sm:w-11",
  md: "h-9 w-9 max-sm:h-11 max-sm:w-11",
};

const ICON_SIZE_CLASS: Record<OverflowActionsSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
};

function useControllableExpanded({
  expanded,
  defaultExpanded,
  onExpandedChange,
}: {
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [internalExpanded, setInternalExpanded] = useState(
    defaultExpanded ?? false,
  );
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

export function OverflowActions({
  primaryActions,
  overflowActions = [],
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  onAction,
  collapseOnAction = false,
  size = "md",
  openLabel,
  closeLabel,
  className,
  classNames,
}: OverflowActionsProps) {
  const reduce = useReducedMotion();
  const canHover = useHoverCapable();
  const overflowId = useId();
  const overflowWrapperRef = useRef<HTMLDivElement>(null);
  const overflowWrapperLeftRef = useRef(0);
  const [isExpanded, setIsExpanded] = useControllableExpanded({
    expanded,
    defaultExpanded,
    onExpandedChange,
  });
  const hasOverflow = overflowActions.length > 0;
  const open = hasOverflow && isExpanded;

  const transition = reduce ? { duration: 0 } : SHELL_TRANSITION;

  useLayoutEffect(() => {
    const overflowNode = overflowWrapperRef.current;
    if (!overflowNode) return;

    if (!open) {
      overflowNode.style.left = `${
        overflowWrapperLeftRef.current -
        overflowNode.getBoundingClientRect().left
      }px`;
      return;
    }

    overflowNode.style.left = "";
    overflowWrapperLeftRef.current = overflowNode.getBoundingClientRect().left;
  }, [open]);

  const handleAction = (item: OverflowActionItem, event?: ReactMouseEvent<HTMLButtonElement>) => {
    item.onClick?.(event);
    onAction?.(item);
    if (collapseOnAction) setIsExpanded(false);
  };

  return (
    <motion.div
      layout
      transition={transition}
      className={cn("inline-flex", classNames?.root, className)}
    >
      <motion.div
        layout
        transition={transition}
        className={cn(
          "relative inline-flex items-center overflow-hidden rounded-full border border-border bg-card",
          TRACK_SIZE_CLASS[size],
          classNames?.track,
        )}
      >
        <motion.div
          layout
          transition={transition}
          className={cn("inline-flex items-center", GROUP_GAP_CLASS[size])}
        >
          {primaryActions.map((item) => (
            <ActionButton
              key={item.id}
              item={item}
              size={size}
              reduce={reduce}
              canHover={canHover}
              onAction={handleAction}
              layoutTransition={transition}
              className={cn(classNames?.action, classNames?.primaryAction)}
              iconClassName={classNames?.icon}
              labelClassName={classNames?.label}
            />
          ))}
        </motion.div>

        <AnimatePresence mode="popLayout" initial={false}>
          {open ? (
            <motion.div
              key="overflow-actions"
              ref={overflowWrapperRef}
              id={overflowId}
              layout
              aria-hidden={!open}
              transition={transition}
              className={cn(
                "relative inline-flex w-max items-center",
                GROUP_GAP_CLASS[size],
              )}
            >
              {overflowActions.map((item) => (
                <ActionButton
                  key={item.id}
                  item={item}
                  size={size}
                  reduce={reduce}
                  canHover={canHover}
                  overflow
                  visible={open}
                  variants={OVERFLOW_ACTION_VARIANTS}
                  onAction={handleAction}
                  layoutTransition={transition}
                  className={cn(classNames?.action, classNames?.overflowAction)}
                  iconClassName={classNames?.icon}
                  labelClassName={classNames?.label}
                />
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {hasOverflow ? (
          <motion.button
            type="button"
            layout
            aria-expanded={open}
            aria-controls={open ? overflowId : undefined}
            aria-label={open ? closeLabel : openLabel}
            title={open ? closeLabel : openLabel}
            onClick={() => setIsExpanded(!isExpanded)}
            whileTap={reduce ? undefined : { scale: 0.96 }}
            whileHover={reduce || !canHover ? undefined : { scale: 1.03 }}
            transition={transition}
            className={cn(
              "relative inline-grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground outline-none disabled:pointer-events-none disabled:opacity-50",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              TOGGLE_SIZE_CLASS[size],
              classNames?.toggle,
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={open ? "close" : "open"}
                variants={ICON_VARIANTS}
                initial={reduce ? { opacity: 0 } : "hidden"}
                animate={reduce ? { opacity: 1 } : "visible"}
                exit={reduce ? { opacity: 0 } : "exit"}
                className="inline-grid place-items-center"
              >
                {open ? (
                  <X className={ICON_SIZE_CLASS[size]} />
                ) : (
                  <DotsThree className={ICON_SIZE_CLASS[size]} weight="bold" />
                )}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        ) : null}
      </motion.div>
    </motion.div>
  );
}

function ActionButton({
  item,
  size,
  reduce,
  canHover,
  overflow,
  visible = true,
  variants,
  onAction,
  layoutTransition,
  className,
  iconClassName,
  labelClassName,
}: {
  item: OverflowActionItem;
  size: OverflowActionsSize;
  reduce: boolean | null;
  canHover: boolean;
  overflow?: boolean;
  visible?: boolean;
  variants?: Variants;
  onAction: (item: OverflowActionItem, event?: ReactMouseEvent<HTMLButtonElement>) => void;
  layoutTransition: Transition;
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
}) {
  const label = typeof item.label === "string" ? item.label : undefined;

  return (
    <motion.span
      layout="position"
      variants={variants}
      initial={variants ? (reduce ? { opacity: 0 } : "hidden") : undefined}
      animate={variants ? (reduce ? { opacity: 1 } : "visible") : undefined}
      exit={variants ? (reduce ? { opacity: 0 } : "exit") : undefined}
      whileTap={reduce || item.disabled ? undefined : { scale: 0.97 }}
      whileHover={
        reduce || !canHover || item.disabled ? undefined : { scale: 1.008 }
      }
      transition={layoutTransition}
      className="inline-flex shrink-0"
    >
      <button
        type="button"
        disabled={item.disabled}
        aria-label={item.ariaLabel}
        tabIndex={overflow && !visible ? -1 : undefined}
        title={label}
        onClick={(event) => onAction(item, event)}
        {...item.attributes}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-background font-medium text-foreground outline-none",
          "disabled:pointer-events-none disabled:opacity-45",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          ACTION_SIZE_CLASS[size],
          item.tone === "destructive" &&
            "bg-destructive/10 text-destructive hover:bg-destructive/15",
          className,
        )}
      >
        {item.icon ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center justify-center",
              ICON_SIZE_CLASS[size],
              iconClassName,
            )}
          >
            {item.icon}
          </span>
        ) : null}
        <span className={cn("whitespace-nowrap", labelClassName)}>
          {item.label}
        </span>
      </button>
    </motion.span>
  );
}
