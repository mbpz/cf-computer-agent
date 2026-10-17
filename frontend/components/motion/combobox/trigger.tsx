"use client";
// beui.dev/components/motion/combobox/trigger
//
// §17 localization-fork patches (docs/product/2026-10-17-beui-full-adoption-matrix.md §17):
//   1. labels — `ComboboxTriggerProps.label` is the trigger's accessible name (rendered in a
//      `.sr-only` span, the shape every filter suite addresses), and `ComboboxInputProps`
//      keeps its overridable `aria-label`; no English string is the only value.
//   2. attribute passthrough — `ComboboxTrigger` accepts a `render` element (the caller's
//      `button[aria-haspopup="listbox"]`) so `disabled` and the caller's own attributes reach
//      the trigger button instead of an extra wrapper.
//   4. callback extension — `keyboard="trigger"` moves the payload's own key handling onto
//      the trigger button: a filter row has no inner `ComboboxInput` to carry it, and the
//      trigger opens on click rather than on the payload's input-focus pointerdown.
//
// Contract preserved: the trigger stays `button[aria-haspopup="listbox"]` carrying the
// historical name in `.sr-only` and the same disabled state
// (frontend/components/ui/filter-select.tsx:22; test/unit/frontend-tasks-page.test.tsx:34,143;
// test/unit/frontend-admin-queue-filters.test.tsx:37-40,101).

import { CaretUpDown, MagnifyingGlass } from "@phosphor-icons/react";
import {
  cloneElement,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { cn } from "../../../lib/utils";
import { mergeRefs, useComboboxContext } from "./context";

/** The props the trigger reads off a `render` element and merges with its own. */
export interface ComboboxTriggerRenderProps {
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
}

export interface ComboboxTriggerProps {
  children?: ReactNode;
  className?: string;
  /** Accessible name of the control; the caller passes `frontendText(locale, …)`. */
  label?: ReactNode;
  /** Render the caller's element instead of the payload's div. */
  render?: ReactElement<ComboboxTriggerRenderProps>;
  /**
   * Where the key handling lives. `"input"` is the payload's default (the inner
   * `ComboboxInput`); `"trigger"` handles the same keys on the trigger itself, for
   * layouts that deliberately have no text box.
   */
  keyboard?: "input" | "trigger";
}

export function ComboboxTrigger({
  children,
  className,
  label,
  render,
  keyboard = "input",
}: ComboboxTriggerProps) {
  const context = useComboboxContext("ComboboxTrigger");

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (context.disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!context.open) context.setOpen(true);
      else context.moveActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" && context.open) {
      event.preventDefault();
      context.moveActive("first");
    } else if (event.key === "End" && context.open) {
      event.preventDefault();
      context.moveActive("last");
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (context.open) context.selectActive();
      else context.setOpen(true);
    } else if (event.key === "Escape" && context.open) {
      event.preventDefault();
      context.setOpen(false, true);
    }
  };

  const accessibleName = label === undefined ? null : (
    <span className="sr-only">{label}</span>
  );

  const semantics = {
    id: context.triggerId,
    "aria-haspopup": "listbox" as const,
    "aria-expanded": context.open,
    "aria-controls": context.listId,
    "aria-disabled": context.disabled || undefined,
    "data-state": context.open ? "open" : "closed",
  };

  if (render) {
    const caller = render.props;
    return cloneElement(render, {
      ...semantics,
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        caller.onClick?.(event);
        if (event.defaultPrevented || context.disabled) return;
        context.setOpen(!context.open);
      },
      onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
        caller.onKeyDown?.(event);
        if (event.defaultPrevented) return;
        onKeyDown(event);
      },
      onPointerDown: caller.onPointerDown,
      className: cn(
        "relative z-20 flex h-11 w-full min-w-32 cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 text-sm text-foreground transition-[border-color]",
        "hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        caller.className,
        className,
      ),
      children: (
        <>
          {accessibleName}
          {children ?? caller.children}
        </>
      ),
    });
  }

  return (
    <div
      ref={context.triggerRef}
      {...semantics}
      onPointerDown={(event) => {
        if (context.disabled || event.target === context.inputRef.current) return;
        event.preventDefault();
        if (keyboard === "trigger") {
          context.setOpen(!context.open);
          return;
        }
        context.inputRef.current?.focus({ preventScroll: true });
        context.setOpen(true);
      }}
      onKeyDown={keyboard === "trigger" ? onKeyDown : undefined}
      className={cn(
        "relative z-20 flex h-10 w-full min-w-52 cursor-text items-center justify-between gap-3 rounded-lg border border-border bg-transparent px-3 text-sm text-foreground transition-[border-color] hover:border-foreground/40",
        "focus-within:ring-2 focus-within:ring-foreground/20",
        context.disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <span className="min-w-0 flex-1 text-left">
        {accessibleName}
        {children}
      </span>
      <span aria-hidden className="shrink-0 text-muted-foreground">
        <CaretUpDown className="size-4" />
      </span>
    </div>
  );
}

export interface ComboboxValueProps {
  placeholder?: ReactNode;
  children?:
    | ReactNode
    | ((value: string | undefined, label: string | undefined) => ReactNode);
  className?: string;
}

export function ComboboxValue({
  placeholder = "Select an option",
  children,
  className,
}: ComboboxValueProps) {
  const context = useComboboxContext("ComboboxValue");
  const label = context.labelFor(context.value);
  const content =
    typeof children === "function"
      ? children(context.value, label)
      : children ?? label ?? placeholder;

  return (
    <span
      className={cn(
        "block truncate",
        context.value === undefined
          ? "text-muted-foreground"
          : "text-foreground",
        className,
      )}
    >
      {content}
    </span>
  );
}

export interface ComboboxInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "defaultValue" | "value"
  > {
  ref?: Ref<HTMLInputElement>;
  wrapperClassName?: string;
}

export function ComboboxInput({
  ref,
  className,
  wrapperClassName,
  "aria-label": ariaLabel = "Search options",
  onChange,
  onClick,
  onFocus,
  onKeyDown,
  onPointerDown,
  placeholder = "Search…",
  ...props
}: ComboboxInputProps) {
  const context = useComboboxContext("ComboboxInput");
  const selectedLabel = context.labelFor(context.value);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      // Opening is the whole action. While closed the list is still filtering
      // by the query the last session left, so a step taken here would be
      // measured against rows the next render replaces — and stamped with a
      // query it no longer has, which discards it. Open onto the selection,
      // and let the next key step through the list the user can see.
      if (!context.open) {
        context.setOpen(true);
        return;
      }
      context.moveActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" && context.open) {
      event.preventDefault();
      context.moveActive("first");
    } else if (event.key === "End" && context.open) {
      event.preventDefault();
      context.moveActive("last");
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (context.open) context.selectActive();
      else context.setOpen(true);
    } else if (event.key === "Escape" && context.open) {
      event.preventDefault();
      context.setOpen(false, true);
    }
  };

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2",
        wrapperClassName,
      )}
    >
      <MagnifyingGlass aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <input
        {...props}
        ref={mergeRefs(ref, context.inputRef)}
        id={context.inputId}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={context.open}
        aria-controls={context.listId}
        aria-activedescendant={
          context.open ? context.activeItemId : undefined
        }
        autoComplete="off"
        disabled={context.disabled}
        value={context.open ? context.query : (selectedLabel ?? "")}
        placeholder={placeholder}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          if (event.defaultPrevented || context.open) return;
          event.preventDefault();
          context.inputRef.current?.focus({ preventScroll: true });
          context.setOpen(true);
        }}
        onFocus={(event) => {
          context.setOpen(true);
          onFocus?.(event);
        }}
        onClick={(event) => {
          context.setOpen(true);
          onClick?.(event);
        }}
        onChange={(event) => {
          context.setOpen(true);
          context.setQuery(event.target.value);
          onChange?.(event);
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          "h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
          className,
        )}
      />
    </div>
  );
}
