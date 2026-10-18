// Many unit suites hand-roll a DOM: they stub `window`/`document` with a
// happy-dom Window but never expose the DOM constructors as globals. Anything
// that feature-detects with `instanceof HTMLElement`, reads
// `Element.prototype`, or schedules `requestAnimationFrame` then throws
// ReferenceError — and because those throw from animation callbacks the
// failures surface as unhandled rejections on unrelated tests.
//
// Mirror the stubbed window lazily so a suite that installs a DOM gets a
// complete, consistent set of globals. Each mirror stays writable: suites that
// assign or stub these globals keep working, and their value wins.

const MIRRORED = [
  "Element",
  "HTMLElement",
  "SVGElement",
  "Node",
  "NodeList",
  "Document",
  "DocumentFragment",
  "Text",
  "MouseEvent",
  "KeyboardEvent",
  "PointerEvent",
  "FocusEvent",
  "IntersectionObserver",
  "ResizeObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
] as const;

type GlobalScope = Record<string, unknown> & { window?: Record<string, unknown> };

for (const name of MIRRORED) {
  if (name in globalThis) continue;
  try {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        const scope = globalThis as unknown as GlobalScope;
        const value = scope.window?.[name];
        // Window methods must keep their receiver or they throw Illegal invocation.
        return typeof value === "function" ? value.bind(scope.window) : value;
      },
      set(value: unknown) {
        // First write wins ownership outright: the mirror is only a fallback for
        // hosts that never defined the global themselves.
        Object.defineProperty(globalThis, name, { configurable: true, enumerable: true, writable: true, value });
      },
    });
  } catch {
    // A host that forbids extending its globals keeps its current behaviour.
  }
}

export {};
