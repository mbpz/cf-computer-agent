"use client";
// beui.dev/components/agents/todo-list
//
// §17 localization-fork patches (docs/product/2026-10-17-beui-full-adoption-matrix.md §17):
//   1. labels — `labels` carries every string the a11y tree can reach (the list's own name,
//      the per-status names, the completed-count sentence, the empty copy and the disclosure
//      controls); the caller passes `frontendText(locale, …)`. No English default remains.
//   2. attribute passthrough — `...rest` lands on the section, `data-todo-list-viewport`
//      marks the scroll viewport the append feed drives, and each row carries
//      `data-todo-item="<id>"` so a suite can address a row without a table.
//   3. slot extension — `emptyState` replaces the built-in "no tasks" sentence and
//      `TodoItem.actions` renders per-row controls (edit / status / delete and their
//      confirmation gates) inside the row, after the title and detail.
//   4. callback/prop extension — `collapsible={false}` keeps the header without a toggle,
//      `autoScroll={false}` stops a page-sized list from jumping to its own end,
//      `onEndReached` lets the host page pull the next page from the viewport,
//      `maxHeight={null}` removes the panel's 248px cap, and `animateRows={false}` lets a
//      page-sized list swap its rows immediately: a page read replaces the window, so an
//      exiting row must not sit beside the rows of the page that replaced it.
//
// Contract preserved: the tasks page keeps its own `<section>` and its per-row controls
// with their accessible names (frontend/pages/tasks/tasks-page.tsx:121-126;
// test/unit/frontend-tasks-page.test.tsx:39-46), the shared pager's addressing
// (`select[aria-label="Rows per page"]`, `data-pagination-desktop`) and the mobile append
// feed's end-of-list status.

import { CaretDown, ListChecks } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ActionSwapRollText } from "../motion/action-swap-roll";
import { AgentDisclosure } from "./agent-disclosure";
import {
  EASE_OUT,
  SPRING_LAYOUT,
  SPRING_SWAP,
} from "../../lib/ease";
import { cn } from "../../lib/utils";

export type TodoItemStatus =
  | "pending"
  | "in-progress"
  | "completed"
  | "cancelled";

export interface TodoItem {
  id: string;
  title: ReactNode;
  status?: TodoItemStatus;
  progress?: number;
  detail?: ReactNode;
  /** Per-row controls, rendered beside the row's content and never inside a row button. */
  actions?: ReactNode;
}

/** Every string this list can announce, supplied by the caller's locale. */
export interface TodoListLabels {
  /** Accessible name of the list region. */
  list: string;
  /** Visible header title. */
  title: ReactNode;
  /** `{completed}` and `{count}` are replaced with the row counts. */
  completedCount: string;
  empty: string;
  expand: string;
  collapse: string;
  status: Record<TodoItemStatus, string>;
}

export interface TodoListProps
  extends Omit<ComponentPropsWithoutRef<"section">, "children" | "title"> {
  items: TodoItem[];
  title?: ReactNode;
  labels: TodoListLabels;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The header is a disclosure by default; a page-owned list keeps it as a plain label. */
  collapsible?: boolean;
  collapseOnComplete?: boolean;
  /** Jump the viewport to the newest row. Off for a page-sized list. */
  autoScroll?: boolean;
  /** `null` removes the panel cap, for a list that fills its page region. */
  maxHeight?: number | null;
  /** Replaces the built-in empty sentence (e.g. the page's own `PageState`). */
  emptyState?: ReactNode;
  /** Fired when the viewport reaches its end, so a host page can append a page. */
  onEndReached?: () => void;
  /** Row enter/exit motion. Off for a list whose rows are replaced by a page read. */
  animateRows?: boolean;
}

function TodoHeaderIcon({ complete }: { complete: boolean }) {
  const reduce = useReducedMotion() ?? false;

  return (
    <span
      aria-hidden="true"
      className="relative grid size-6 shrink-0 place-items-center"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {complete ? (
          <motion.svg
            key="complete"
            viewBox="0 0 24 24"
            initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.72 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0 } : SPRING_SWAP}
            className="absolute size-5.5 overflow-visible text-primary"
          >
            <circle cx="12" cy="12" r="9" fill="currentColor" />
            <motion.path
              d="M7.5 12.25 10.5 15.25 16.75 8.75"
              fill="none"
              stroke="white"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={
                reduce ? { duration: 0 } : { duration: 0.24, ease: EASE_OUT }
              }
            />
          </motion.svg>
        ) : (
          <motion.span
            key="todo"
            initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.72 }}
            transition={reduce ? { duration: 0 } : SPRING_SWAP}
            className="absolute grid place-items-center text-muted-foreground"
          >
            <ListChecks className="size-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function TodoStatusIcon({
  status,
  progress,
}: {
  status: TodoItemStatus;
  progress?: number;
}) {
  const reduce = useReducedMotion() ?? false;
  const normalizedProgress =
    progress === undefined ? 0.68 : Math.min(100, Math.max(0, progress)) / 100;

  return (
    <motion.svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      initial={false}
      className={cn(
        "mx-0.5 size-5 shrink-0 overflow-visible text-muted-foreground",
        status === "in-progress" && "text-foreground",
        status === "cancelled" && "text-destructive",
      )}
    >
      <motion.circle
        cx="12"
        cy="12"
        r="9"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={status === "pending" ? "2 3" : undefined}
        strokeLinecap="round"
        initial={false}
        animate={{ fillOpacity: status === "completed" ? 0.06 : 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.18, ease: EASE_OUT }}
        className={cn(status === "in-progress" && "opacity-20")}
      />
      <motion.circle
        cx="12"
        cy="12"
        r="9"
        pathLength="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        initial={false}
        animate={{
          pathLength: status === "in-progress" ? normalizedProgress : 0,
          opacity: status === "in-progress" ? 1 : 0,
          rotate:
            status === "in-progress" && progress === undefined && !reduce
              ? 360
              : -90,
        }}
        transition={
          status === "in-progress" && progress === undefined && !reduce
            ? { rotate: { duration: 1.1, repeat: Infinity, ease: "linear" } }
            : reduce
              ? { duration: 0 }
              : SPRING_LAYOUT
        }
        style={{ transformOrigin: "12px 12px" }}
      />
      <motion.path
        d="M7.5 12.25 10.5 15.25 16.75 8.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{
          pathLength: status === "completed" ? 1 : 0,
          opacity: status === "completed" ? 1 : 0,
        }}
        transition={reduce ? { duration: 0 } : { duration: 0.24, ease: EASE_OUT }}
      />
      <motion.path
        d="M8.5 8.5 15.5 15.5M15.5 8.5 8.5 15.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        initial={false}
        animate={{
          pathLength: status === "cancelled" ? 1 : 0,
          opacity: status === "cancelled" ? 1 : 0,
        }}
        transition={reduce ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
      />
    </motion.svg>
  );
}

export function TodoList({
  items,
  title,
  labels,
  open,
  defaultOpen = true,
  onOpenChange,
  collapsible = true,
  collapseOnComplete = true,
  autoScroll = true,
  maxHeight = 248,
  emptyState,
  onEndReached,
  animateRows = true,
  className,
  ...rest
}: TodoListProps) {
  const heading = title ?? labels.title;
  const reduce = useReducedMotion() ?? false;
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousComplete = useRef(false);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const currentOpen = open ?? internalOpen;
  const completed = items.filter((item) => item.status === "completed").length;
  const allComplete = items.length > 0 && completed === items.length;
  const itemCount = items.length;

  const setOpen = useCallback(
    (next: boolean) => {
      if (open === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange, open],
  );

  useEffect(() => {
    if (previousComplete.current && !allComplete) {
      setOpen(true);
    }
    if (!previousComplete.current && allComplete && collapseOnComplete) {
      setOpen(false);
    }
    previousComplete.current = allComplete;
  }, [allComplete, collapseOnComplete, setOpen]);

  useLayoutEffect(() => {
    if (!autoScroll) return;
    const viewport = viewportRef.current;
    if (!viewport || itemCount === 0) return;

    const frame = requestAnimationFrame(() => {
      if (viewport.scrollHeight <= viewport.clientHeight) return;
      if (typeof viewport.scrollTo === "function") {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: reduce ? "auto" : "smooth",
        });
      } else {
        viewport.scrollTop = viewport.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [itemCount, reduce]);

  return (
    <section
      {...rest}
      aria-label={labels.list}
      className={cn(
        "w-full overflow-hidden rounded-lg border border-border/70",
        className,
      )}
    >
      {collapsible ? (
        <button
          id={triggerId}
          type="button"
          aria-expanded={currentOpen}
          aria-controls={contentId}
          aria-label={`${String(heading)} · ${currentOpen ? labels.collapse : labels.expand}`}
          onClick={() => setOpen(!currentOpen)}
          className="group flex h-11 w-full items-center gap-2.5 rounded-lg px-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <TodoHeaderIcon complete={allComplete} />
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90">{heading}</h3>
          <span
            className={cn(
              "shrink-0 text-xs font-medium tabular-nums text-muted-foreground",
              allComplete && "text-primary",
            )}
          >
            <span className="sr-only">
              {labels.completedCount.split("{completed}").join(String(completed)).split("{count}").join(String(items.length))}
            </span>
            <span aria-hidden="true" className="inline-flex">
              <ActionSwapRollText value={String(completed)}>
                {completed}
              </ActionSwapRollText>
              <span>/</span>
              <span>{items.length}</span>
            </span>
          </span>
          <motion.span
            aria-hidden="true"
            animate={{ rotate: currentOpen ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : SPRING_SWAP}
            className="text-muted-foreground/50 transition-colors group-hover:text-muted-foreground"
          >
            <CaretDown className="size-3.5" />
          </motion.span>
        </button>
      ) : (
        <div className="group flex h-11 w-full items-center gap-2.5 px-3.5">
          <TodoHeaderIcon complete={allComplete} />
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90">{heading}</h3>
          <span
            className={cn(
              "shrink-0 text-xs font-medium tabular-nums text-muted-foreground",
              allComplete && "text-primary",
            )}
          >
            <span className="sr-only">
              {labels.completedCount.split("{completed}").join(String(completed)).split("{count}").join(String(items.length))}
            </span>
            <span aria-hidden="true" className="inline-flex">
              <ActionSwapRollText value={String(completed)}>{completed}</ActionSwapRollText>
              <span>/</span>
              <span>{items.length}</span>
            </span>
          </span>
        </div>
      )}

      <AgentDisclosure
        id={contentId}
        role="region"
        aria-labelledby={collapsible ? triggerId : undefined}
        aria-label={collapsible ? undefined : labels.list}
        open={collapsible ? currentOpen : true}
      >
        <div
          ref={viewportRef}
          data-todo-list-viewport=""
          onScroll={(event) => {
            if (!onEndReached) return;
            const viewport = event.currentTarget;
            if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 8) onEndReached();
          }}
          className="overflow-y-auto px-2 pb-2"
          style={maxHeight === null ? undefined : { maxHeight }}
        >
          {items.length ? (
            <ol className="space-y-0">
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item) => {
                const status = item.status ?? "pending";
                return (
                  <motion.li
                    layout="position"
                    key={item.id}
                    data-todo-item={item.id}
                    initial={animateRows ? (reduce ? { opacity: 1 } : { opacity: 0, y: 6 }) : false}
                    animate={{ opacity: 1, y: 0 }}
                    exit={animateRows ? (reduce ? { opacity: 0 } : { opacity: 0, y: -3 }) : undefined}
                    transition={
                      reduce
                        ? { duration: 0 }
                        : {
                            opacity: { duration: 0.18, ease: EASE_OUT },
                            y: SPRING_LAYOUT,
                            layout: SPRING_LAYOUT,
                          }
                    }
                    className="flex min-h-11 items-center gap-2.5 rounded-md px-1.5 py-1 lg:min-h-9"
                  >
                    <TodoStatusIcon status={status} progress={item.progress} />
                    <span className="sr-only">{labels.status[status]}: </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm leading-5",
                        status === "pending" && "text-muted-foreground/65",
                        status === "in-progress" && "text-foreground",
                        status === "completed" && "text-muted-foreground/60",
                        status === "cancelled" && "text-muted-foreground/55",
                      )}
                    >
                      <span className="relative inline-block max-w-full">
                        {item.title}
                        <motion.span
                          aria-hidden="true"
                          initial={false}
                          animate={{
                            scaleX: status === "completed" ? 1 : 0,
                            opacity: status === "completed" ? 1 : 0,
                          }}
                          transition={
                            reduce
                              ? { duration: 0 }
                              : { duration: 0.28, ease: EASE_OUT, delay: 0.06 }
                          }
                          className="absolute inset-x-0 top-1/2 h-px origin-left bg-current"
                        />
                      </span>
                    </span>
                    {item.detail ? (
                      <span className="min-w-0 text-sm text-muted-foreground/55">
                        {item.detail}
                      </span>
                    ) : null}
                    {item.actions ? (
                      <span className="shrink-0">{item.actions}</span>
                    ) : null}
                  </motion.li>
                );
              })}
            </AnimatePresence>
            </ol>
          ) : (
            emptyState ?? (
              <p className="px-1.5 py-2 text-sm text-muted-foreground">{labels.empty}</p>
            )
          )}
        </div>
      </AgentDisclosure>
    </section>
  );
}
