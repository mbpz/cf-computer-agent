"use client";
// beui.dev/components/motion/radio
//
// §17 localization-fork patches (docs/product/2026-10-17-beui-full-adoption-matrix.md §17):
//   1. labels — `RadioGroupProps.ariaLabel` / `RadioGroupItemProps.name` replace hardcoded
//      English group names; the caller passes `frontendText(locale, …)` for both locales.
//   2. attribute passthrough — `RadioGroup` and `RadioGroupItem` spread `...rest` onto the
//      `role="radiogroup"` element and the `role="radio"` button, so `data-*`, `aria-*`
//      and `disabled` reach the same node.
// Contract preserved: the review period is a two-value choice with one selected option —
// `role="radiogroup"` + `role="radio"` + `aria-checked` (frontend/pages/knowledge-page.tsx:65,
// frontend/pages/workbench-review-page.tsx:20) and the caller's `aria-label` names the group
// (test/unit/frontend-review-period-refresh.test.tsx:131).

import { motion, MotionConfig, type HTMLMotionProps, useReducedMotion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
} from "react";
import { SPRING_LAYOUT, SPRING_PRESS } from "../../lib/ease";
import { cn } from "../../lib/utils";

type RadioCtx = {
  value: string;
  setValue: (value: string) => void;
  layoutId: string;
};

const RadioCtx = createContext<RadioCtx | null>(null);

function useRadioGroup() {
  const ctx = useContext(RadioCtx);
  if (!ctx) {
    throw new Error("RadioGroupItem must be used inside <RadioGroup>");
  }
  return ctx;
}

export interface RadioGroupProps
  extends Omit<ComponentPropsWithRef<"div">, "children" | "onChange"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  orientation?: "vertical" | "horizontal";
}

export function RadioGroup({
  value,
  defaultValue = "",
  onValueChange,
  children,
  className,
  orientation = "vertical",
  ...props
}: RadioGroupProps) {
  const [internal, setInternal] = useState(defaultValue);
  const layoutId = useId();
  const reduce = useReducedMotion();
  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const setValue = useCallback(
    (next: string) => {
      if (!controlled) setInternal(next);
      onValueChange?.(next);
    },
    [controlled, onValueChange],
  );
  const contextValue = useMemo(
    () => ({ value: current, setValue, layoutId }),
    [current, layoutId, setValue],
  );

  return (
    <MotionConfig transition={reduce ? { duration: 0 } : SPRING_LAYOUT}>
      <RadioCtx.Provider value={contextValue}>
        <div
          {...props}
          role="radiogroup"
          className={cn(
            "flex gap-3",
            orientation === "vertical" ? "flex-col" : "flex-row flex-wrap",
            className,
          )}
        >
          {children}
        </div>
      </RadioCtx.Provider>
    </MotionConfig>
  );
}

export interface RadioGroupItemProps
  extends Omit<HTMLMotionProps<"button">, "onChange" | "value" | "type" | "role" | "ref"> {
  value: string;
  label?: string;
  /** Supporting text under the label, announced as the description rather than the name. */
  description?: string;
}

export function RadioGroupItem({
  value,
  label,
  description,
  disabled,
  className,
  id: idProp,
  ...props
}: RadioGroupItemProps) {
  const { value: groupValue, setValue, layoutId } = useRadioGroup();
  const autoId = useId();
  const id = idProp ?? autoId;
  const reduce = useReducedMotion();
  const selected = groupValue === value;
  const descriptionId = description ? `${id}-description` : undefined;
  // A `role="radio"` button is not a labelable element, so the wrapping `<label>` cannot
  // name it: the visible label is the name, and the description is announced separately
  // so it never folds into it.
  const labelId = label ? `${id}-label` : undefined;

  return (
    <label
      htmlFor={id}
      className={cn(
        "inline-flex gap-3",
        description ? "items-start" : "items-center",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        className,
      )}
    >
      <motion.button
        {...props}
        id={id}
        type="button"
        role="radio"
        aria-checked={selected}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={(event) => {
          props.onClick?.(event);
          if (!event.defaultPrevented && !disabled) setValue(value);
        }}
        whileTap={reduce || disabled ? undefined : { scale: 0.92 }}
        transition={SPRING_PRESS}
        data-state={selected ? "checked" : "unchecked"}
        className={cn(
          "relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 outline-none transition-colors duration-200",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-60",
          // Every review-period choice is a thumb target below the shell's `lg` edge.
          "max-lg:size-11",
          selected
            ? "border-primary"
            : "border-muted-foreground/50 hover:border-muted-foreground",
        )}
      >
        {selected ? (
          <motion.span
            layoutId={layoutId}
            className="absolute inset-1 rounded-full bg-primary"
            transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
          />
        ) : null}
      </motion.button>
      {label || description ? (
        <span className={cn("flex min-w-0 flex-col gap-0.5 select-none", disabled && "opacity-60")}>
          {label ? (
            <span
              id={labelId}
              // Geist sits low in a 20px line; a 16px line lifts the text onto the control.
              className={cn("text-sm text-foreground", description && "leading-4")}
            >
              {label}
            </span>
          ) : null}
          {description ? (
            <span id={descriptionId} className="text-xs text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
}
