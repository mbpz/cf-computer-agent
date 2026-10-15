import type { Window } from "happy-dom";

/**
 * The shared table renders its pager on desktop and keeps appending on narrow
 * viewports, so a list test has to say which surface it exercises. Happy-dom
 * windows have no `matchMedia`, and the table treats that as desktop; call this
 * to opt a test into the mobile feed.
 */
export function stubListViewport(viewport: InstanceType<typeof Window>, mode: "desktop" | "mobile"): void {
  Object.defineProperty(viewport, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: mode === "desktop" && query === "(min-width: 1024px)",
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}
