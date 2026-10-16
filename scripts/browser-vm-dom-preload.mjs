// Node-side harness preload for the browser-vm test scripts.
//
// Those scripts render the real App in Node with a happy-dom window, but they install
// only a hand-picked subset of globals (window, document, navigator, history,
// location, HTMLElement, MutationObserver, fetch). Components that reach for the bare
// global getComputedStyle / Element / matchMedia / rAF then throw before the assertions
// run. This preload supplies the missing ones from a throwaway happy-dom window and
// skips anything a test installs itself, so each script keeps owning window/document.
import { Window } from "happy-dom";

const fallback = new Window({ url: "about:blank" });

const BOUND = new Set(["matchMedia", "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle", "getSelection"]);
const NAMES = [
  "getComputedStyle", "getSelection", "matchMedia", "requestAnimationFrame", "cancelAnimationFrame",
  "Element", "HTMLElement", "HTMLCanvasElement", "HTMLInputElement", "HTMLTextAreaElement", "SVGElement",
  "Node", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "PointerEvent", "FocusEvent", "InputEvent",
  "DOMRect", "DOMParser", "XMLSerializer", "ResizeObserver", "IntersectionObserver", "CSS", "CSSStyleSheet",
];

for (const name of NAMES) {
  if (name in globalThis) continue;
  const value = fallback[name];
  if (value === undefined) continue;
  const resolved = typeof value === "function" && BOUND.has(name) ? value.bind(fallback) : value;
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: resolved });
}
