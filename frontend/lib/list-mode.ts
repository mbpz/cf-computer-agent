import { useSyncExternalStore } from "react";

/**
 * Desktop shows the footer pager and replaces the window per page; narrow
 * viewports keep the infinite-scroll feed. Tailwind's `lg` breakpoint is the
 * same edge the shell uses to switch its layout.
 */
export const LIST_DESKTOP_QUERY = "(min-width: 1024px)";

export type ListMode = "desktop" | "mobile";

function supportsMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function subscribe(onChange: () => void): () => void {
  if (!supportsMatchMedia()) return () => undefined;
  const query = window.matchMedia(LIST_DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readMode(): ListMode {
  return supportsMatchMedia() && !window.matchMedia(LIST_DESKTOP_QUERY).matches ? "mobile" : "desktop";
}

/** Server markup and environments without `matchMedia` render the desktop surface. */
function readServerMode(): ListMode {
  return "desktop";
}

export function useListMode(): ListMode {
  return useSyncExternalStore(subscribe, readMode, readServerMode);
}
