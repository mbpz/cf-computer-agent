import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

export function nextFocusableIndex(current: number, length: number, backwards: boolean): number {
  if (length <= 0) return -1;
  const step = backwards ? -1 : 1;
  return (current + step + length) % length;
}

export function useFocusScope(active: boolean, onEscape?: () => void): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!active || !root || typeof document === "undefined") return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const initial = focusables()[0] ?? root;
    initial.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onEscape?.();
        return;
      }
      if (event.key !== "Tab") return;
      const targets = focusables();
      if (!targets.length) {
        event.preventDefault();
        root.focus();
        return;
      }
      const current = targets.indexOf(document.activeElement as HTMLElement);
      const next = nextFocusableIndex(current < 0 ? (event.shiftKey ? 0 : targets.length - 1) : current, targets.length, event.shiftKey);
      event.preventDefault();
      targets[next]?.focus();
    };
    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [active, onEscape]);
  return ref;
}
