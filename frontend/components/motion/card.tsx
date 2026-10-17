"use client";
// beui.dev/components/motion/card, written in by hand.
//
// Two deliberate departures from the published payload, both forced by this
// repo's existing contracts (see docs/product/2026-10-17-beui-full-adoption-matrix.md):
//
// - Radius stays `rounded-lg`, which is `var(--radius)` (frontend/styles/globals.css:22).
//   The payload's `rounded-2xl` would add a second radius to the card chrome.
// - Padding stays owned by the parts, not the root. The payload gives the root
//   `py-6 gap-6` and the parts inline padding only; 74 of the 78 `<Card>` call
//   sites in this repo already pad through a part (`<CardContent className="p-4">`
//   and friends), so root padding would double theirs. The parts therefore carry
//   their own vertical padding and the root carries none, which is how the
//   previous card behaved.

import { animate, isDragActive, motion, useMotionValue, useReducedMotion } from "motion/react";
import { type ComponentPropsWithRef, createContext, useContext, useEffect, useRef } from "react";
import { SPRING_PRESS } from "../../lib/ease";
import { cn } from "../../lib/utils";

export type CardVariant = "outlined" | "muted";
export type CardSize = "default" | "compact";

const CardSizeContext = createContext<CardSize>("default");

const VARIANT_CLASS: Record<CardVariant, string> = {
  // `material-surface` is this product's frosted card material; the payload's
  // `bg-background` would drop the card out of the material system.
  outlined: "border-border material-surface",
  muted: "border-transparent bg-muted",
};

// Each part pads itself, so a part can be left out without the others losing
// their edges.
const PART_PADDING: Record<CardSize, { header: string; content: string; footer: string }> = {
  default: { header: "p-6", content: "p-6 pt-0", footer: "p-6 pt-0" },
  compact: { header: "p-4", content: "p-4 pt-0", footer: "p-4 pt-0" },
};

/**
 * Spread onto the one control that owns a card (a Checkbox or RadioGroupItem
 * root, or a link or button) to stretch its hit area over the whole card. Any
 * other interactive element inside that card needs `relative z-10` to stay on top.
 */
export const CARD_TARGET_CLASS = "after:absolute after:inset-0";

export interface CardProps extends ComponentPropsWithRef<"div"> {
  /** Default "outlined". */
  variant?: CardVariant;
  /** Spacing for every part. Default "default". */
  size?: CardSize;
  /**
   * Hover and press feedback, for a card that is one target as a whole. Visual
   * only: the card never takes focus, so put the control that owns it inside
   * and stretch it with `CARD_TARGET_CLASS`.
   */
  interactive?: boolean;
  /** Marks a selectable card as chosen. Visual only; the control inside carries the state. */
  selected?: boolean;
}

export function Card({
  variant = "outlined",
  size = "default",
  interactive = false,
  selected = false,
  className,
  children,
  style,
  onPointerDown,
  ...props
}: CardProps) {
  const reduce = useReducedMotion();
  // The press is driven by hand: whileTap would make motion give the card
  // tabIndex 0, an unnamed tab stop ahead of the control that owns the card.
  const scale = useMotionValue(1);
  const releaseRef = useRef<(() => void) | null>(null);

  // Turning `interactive` off or unmounting mid-press settles the card.
  useEffect(() => {
    if (!interactive) return;
    return () => releaseRef.current?.();
  }, [interactive]);

  const press = (event: React.PointerEvent<HTMLDivElement>) => {
    onPointerDown?.(event);
    if (!interactive || reduce || releaseRef.current) return;
    if (!event.isPrimary || event.button !== 0 || isDragActive()) return;

    // Capture phase, as motion's own press does, so a descendant that stops
    // pointerup propagation cannot leave the card pressed.
    const options = { capture: true };
    const release = () => {
      window.removeEventListener("pointerup", release, options);
      window.removeEventListener("pointercancel", release, options);
      window.removeEventListener("pointermove", releaseOnDrag);
      releaseRef.current = null;
      animate(scale, 1, SPRING_PRESS);
    };
    // A drag that starts from the card (a sheet or swipeable row around it)
    // takes over the gesture, so the press ends there. Bubble phase: motion's
    // pan session sets the drag lock in its own window pointermove, registered
    // before this one, so the move that starts the drag already reads it.
    const releaseOnDrag = () => {
      if (isDragActive()) release();
    };
    window.addEventListener("pointerup", release, options);
    window.addEventListener("pointercancel", release, options);
    window.addEventListener("pointermove", releaseOnDrag);
    releaseRef.current = release;
    animate(scale, 0.985, SPRING_PRESS);
  };

  return (
    <CardSizeContext.Provider value={size}>
      <motion.div
        {...(props as React.ComponentProps<typeof motion.div>)}
        onPointerDown={press}
        // Only an interactive card carries the scale, so a plain one keeps
        // any transform the caller gives it.
        style={interactive ? { ...style, scale } : style}
        data-slot="card"
        data-variant={variant}
        data-selected={selected || undefined}
        className={cn(
          "relative flex flex-col rounded-lg border text-card-foreground",
          "transition-[border-color,box-shadow,background-color] duration-200",
          VARIANT_CLASS[variant],
          interactive && "cursor-pointer hover:border-border-strong has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-foreground",
          selected && "border-primary shadow-[0_0_0_1px_var(--primary)] hover:border-primary",
          className,
        )}
      >
        {children}
      </motion.div>
    </CardSizeContext.Provider>
  );
}

export type CardHeaderProps = ComponentPropsWithRef<"div">;

/** Title and description, with an optional CardAction pinned to the top right. */
export function CardHeader({ className, ...props }: CardHeaderProps) {
  const size = useContext(CardSizeContext);
  return (
    <div
      {...props}
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        PART_PADDING[size].header,
        className,
      )}
    />
  );
}

export interface CardTitleProps extends ComponentPropsWithRef<"h3"> {
  /** Heading level, when the card starts a section. Default "h3", the level this card always rendered. */
  as?: "div" | "h2" | "h3" | "h4";
}

export function CardTitle({ as: Tag = "h3", className, ...props }: CardTitleProps) {
  return (
    <Tag
      {...(props as React.ComponentProps<"h3">)}
      data-slot="card-title"
      className={cn("text-[15px] leading-snug font-semibold text-foreground", className)}
    />
  );
}

export type CardDescriptionProps = ComponentPropsWithRef<"p">;

export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return (
    <p
      {...props}
      data-slot="card-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
    />
  );
}

export type CardActionProps = ComponentPropsWithRef<"div">;

/** Sits beside the title and description inside CardHeader. */
export function CardAction({ className, ...props }: CardActionProps) {
  return (
    // Flex, not block: an inline-flex control (Checkbox, Radio) would
    // otherwise sit on a text baseline that moves when its mark appears.
    <div
      {...props}
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 flex items-center self-start justify-self-end",
        className,
      )}
    />
  );
}

export type CardContentProps = ComponentPropsWithRef<"div">;

export function CardContent({ className, ...props }: CardContentProps) {
  const size = useContext(CardSizeContext);
  return <div {...props} data-slot="card-content" className={cn("text-sm", PART_PADDING[size].content, className)} />;
}

export type CardFooterProps = ComponentPropsWithRef<"div">;

export function CardFooter({ className, ...props }: CardFooterProps) {
  const size = useContext(CardSizeContext);
  return (
    <div
      {...props}
      data-slot="card-footer"
      className={cn("flex items-center gap-2", PART_PADDING[size].footer, className)}
    />
  );
}
