import {
  Tooltip as BeuiTooltip,
  TooltipContent as BeuiTooltipContent,
  TooltipProvider as BeuiTooltipProvider,
  TooltipTrigger as BeuiTooltipTrigger,
} from "../motion/tooltip";
import type {
  TooltipContentProps as BeuiTooltipContentProps,
  TooltipProviderProps as BeuiTooltipProviderProps,
  TooltipProps as BeuiTooltipProps,
  TooltipTriggerProps as BeuiTooltipTriggerProps,
} from "../motion/tooltip";
import { cn } from "../../lib/utils";

export type { TooltipAlign, TooltipSide } from "../motion/tooltip";

/**
 * The app's only tooltip: beUI's installed `motion/tooltip` is the single
 * implementation, and this file is the adapter the shell imports.
 *
 * It is an adapter rather than a plain re-export only to keep the chrome and the
 * timing the shell already renders:
 *
 * - the surface is painted with the repo's `material-panel` chrome and
 *   `text-popover-foreground` rather than beUI's plain `bg-background`, so a
 *   label over the sidebar reads as the same material as the panels it sits
 *   beside;
 * - `side` defaults to `right` and the arrow stays on: every call site today
 *   (the collapsed sidebar's icon rows in `shell/app-shell.tsx`) points at an
 *   icon from the left edge, so a label above the trigger would cover the row
 *   it belongs to.
 *
 * The arrow's two CSS hooks are set here rather than in `globals.css`: the
 * beUI arrow reads `--tooltip-arrow-fill`/`--tooltip-arrow-stroke` and stays
 * invisible until a surface declares them, so the adapter declares them from
 * the same tokens the surface uses (background fill, border stroke) and no new
 * colour enters the theme.
 *
 * Timing keeps its previous default: the provider used to pin Radix's
 * `delayDuration` to 0, so the shell's labels appear immediately; beUI's own
 * default of 120ms would have silently slowed every icon row down.
 */
export function TooltipProvider({ delay = 0, ...props }: BeuiTooltipProviderProps) {
  return <BeuiTooltipProvider delay={delay} {...props} />;
}

export function Tooltip(props: BeuiTooltipProps) {
  return <BeuiTooltip {...props} />;
}

export function TooltipTrigger(props: BeuiTooltipTriggerProps) {
  return <BeuiTooltipTrigger {...props} />;
}

export function TooltipContent({ className, side = "right", arrow = true, ...props }: BeuiTooltipContentProps) {
  return <BeuiTooltipContent
    side={side}
    arrow={arrow}
    className={cn("[--tooltip-arrow-fill:var(--material-panel)] [--tooltip-arrow-stroke:var(--border)] material-panel text-popover-foreground", className)}
    {...props}
  />;
}
