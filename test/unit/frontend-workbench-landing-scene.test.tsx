// @vitest-environment node
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneOptions, SceneSnapshot, WorkbenchSceneHandle } from "../../frontend/pages/workbench-landing/workbench-scene-config";
import { WorkbenchScene } from "../../frontend/pages/workbench-landing/workbench-scene";

// Same Workerd/Happy DOM boundary as the existing frontend tests; no evaluated scripts.
const vmContexts = new WeakSet<object>();
class InertVmScript {
  runInContext(context: Record<string, unknown>) {
    for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) {
      context[name] = (globalThis as unknown as Record<string, unknown>)[name];
    }
  }
}
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

function deferred<T>() {
  let settled = false;
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = value => { settled = true; yes(value); };
    reject = reason => { settled = true; no(reason); };
  });
  return { promise, resolve, reject, get settled() { return settled; } };
}

const initial: SceneSnapshot = {
  feature: null, captured: false, taskDone: false, citationId: null,
  paused: false, reduceMotion: false, dark: false,
};
type Attempt = { options: SceneOptions; result: ReturnType<typeof deferred<WorkbenchSceneHandle>> };
let browser: InstanceType<typeof Window>;
let root: Root;
let container: HTMLDivElement;
let mounted: boolean;
let imports: number;
let moduleGate: ReturnType<typeof deferred<void>>;
let moduleEntered: ReturnType<typeof deferred<void>>;
let requests: Attempt[];
let observers: { callback: IntersectionObserverCallback; options?: IntersectionObserverInit; targets: Set<Element>; disconnected: boolean }[];
let motion: MediaQueryList;
let connection: EventTarget & { saveData: boolean };
let hidden: boolean;

beforeEach(() => {
  browser = new Window({ url: "https://app.test/" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "Event", "MutationObserver"] as const) {
    vi.stubGlobal(key, key === "window" ? browser : browser[key]);
  }
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => hidden ? "hidden" : "visible" });
  motion = Object.assign(new browser.EventTarget(), { matches: false, media: "(prefers-reduced-motion: reduce)" }) as unknown as MediaQueryList;
  vi.stubGlobal("matchMedia", () => motion);
  browser.matchMedia = (() => motion) as typeof browser.matchMedia;
  connection = Object.assign(new browser.EventTarget(), { saveData: false }) as unknown as typeof connection;
  Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
  observers = [];
  vi.stubGlobal("IntersectionObserver", class {
    record: typeof observers[number];
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) { this.record = { callback, options, targets: new Set(), disconnected: false }; observers.push(this.record); }
    observe(target: Element) { this.record.targets.add(target); }
    disconnect() { this.record.disconnected = true; this.record.targets.clear(); }
    unobserve(target: Element) { this.record.targets.delete(target); }
  });
  imports = 0;
  requests = [];
  moduleGate = deferred<void>(); moduleGate.resolve();
  moduleEntered = deferred<void>();
  vi.doMock("../../frontend/pages/workbench-landing/workbench-scene-runtime", async () => {
    imports++;
    moduleEntered.resolve();
    await moduleGate.promise;
    return {
      createWorkbenchScene(options: SceneOptions) {
        const result = deferred<WorkbenchSceneHandle>();
        requests.push({ options, result });
        return result.promise;
      },
    };
  });
  container = document.createElement("div");
  container.lang = "en";
  document.body.append(container);
  root = createRoot(container); mounted = true;
});

afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  moduleGate.resolve();
  await vi.dynamicImportSettled();
  container.remove();
  vi.useRealTimers();
  await browser.happyDOM.close();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    // Vite resolves modules over real asynchronous I/O, outside the fake deadline clock.
    if (status() === "loading" && imports === 0) await moduleEntered.promise;
    if (moduleGate.settled) await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function mount(snapshot = initial, strict = false) {
  await act(async () => root.render(strict ? <StrictMode><WorkbenchScene snapshot={snapshot} /></StrictMode> : <WorkbenchScene snapshot={snapshot} />));
  await flush();
}
async function intersect(value: boolean, includeDisconnected = false) {
  await act(async () => {
    for (const observer of observers) {
      if (observer.disconnected && !includeDisconnected) continue;
      observer.callback([{ isIntersecting: value, intersectionRatio: value ? 1 : 0 } as IntersectionObserverEntry], {} as IntersectionObserver);
    }
  });
  await flush();
}
async function visibility(value: boolean) {
  await act(async () => { hidden = !value; document.dispatchEvent(new Event("visibilitychange")); });
  await flush();
}
async function click(action: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[data-scene-action="${action}"]`);
  expect(button, action).not.toBeNull();
  await act(async () => button!.click());
  await flush();
}
function status() { return container.querySelector("[data-scene-status]")?.getAttribute("data-scene-status"); }
function canvas() { return container.querySelector("canvas"); }

// Contract double only for the independently owned runtime. Dataset changes make forwarding observable.
// Deliberately ignores abort when resolving, so stale-host isolation must be implemented by the wrapper.
function createHandle(attempt: Attempt) {
  const node = document.createElement("canvas");
  node.setAttribute("aria-hidden", "true");
  attempt.options.host.append(node);
  let disposals = 0;
  const handle: WorkbenchSceneHandle = {
    update(snapshot) {
      node.dataset.snapshot = JSON.stringify(snapshot);
    },
    setVisible(value) { node.dataset.visible = String(value); },
    dispose() { disposals++; node.remove(); },
  };
  return { handle, node, get disposals() { return disposals; } };
}
async function ready(index = 0) {
  expect(requests[index]).toBeDefined();
  const scene = createHandle(requests[index]);
  await act(async () => requests[index].result.resolve(scene.handle));
  await flush();
  return scene;
}
async function start() {
  await mount(); await intersect(true);
  expect(status()).toBe("loading"); expect(imports).toBe(1); expect(requests).toHaveLength(1);
}

describe("bounded workbench scene wrapper", () => {
  it("moves focus from an activated Load button to Static when Load disappears", async () => {
    await mount({ ...initial, reduceMotion: true });
    await intersect(true);
    const trigger = container.querySelector<HTMLButtonElement>('button[data-scene-action="load"]')!;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    await click("load");

    expect(status()).toBe("loading");
    expect(trigger.isConnected).toBe(false);
    expect(document.activeElement).toBe(container.querySelector('button[data-scene-action="static"]'));
  });

  it.each(["error", "timeout"])("moves focused Retry to Static after %s", async failure => {
    await start();
    if (failure === "error") {
      await act(async () => requests[0].result.reject(new Error("load failed")));
    } else {
      await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    }
    await flush();
    expect(status()).toBe(failure);
    const trigger = container.querySelector<HTMLButtonElement>('button[data-scene-action="retry"]')!;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    await click("retry");

    expect(status()).toBe("loading");
    expect(trigger.isConnected).toBe(false);
    expect(document.activeElement).toBe(container.querySelector('button[data-scene-action="static"]'));
  });

  it.each(["loading", "ready"])("moves focused Static to Load from %s", async phase => {
    await start();
    if (phase === "ready") await ready();
    const trigger = container.querySelector<HTMLButtonElement>('button[data-scene-action="static"]')!;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    await click("static");

    expect(status()).toBe("static");
    expect(trigger.isConnected).toBe(false);
    expect(requests[0].options.signal.aborted).toBe(true);
    expect(document.activeElement).toBe(container.querySelector('button[data-scene-action="load"]'));
  });

  it("does not move focus during automatic loading or async readiness", async () => {
    await mount();
    const trigger = document.createElement("button");
    container.append(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    await intersect(true);
    expect(status()).toBe("loading");
    expect(document.activeElement).toBe(trigger);
    await ready();
    expect(status()).toBe("ready");
    expect(document.activeElement).toBe(trigger);
  });

  it("does not reclaim focus moved away after a manual load when readiness arrives", async () => {
    await mount({ ...initial, reduceMotion: true });
    await intersect(true);
    const trigger = container.querySelector<HTMLButtonElement>('button[data-scene-action="load"]')!;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    await click("load");
    const elsewhere = document.createElement("button");
    container.append(elsewhere);
    elsewhere.focus();
    expect(document.activeElement).toBe(elsewhere);

    await ready();

    expect(status()).toBe("ready");
    expect(document.activeElement).toBe(elsewhere);
  });

  it("does not focus a replacement for an unfocused programmatic activation", async () => {
    await mount({ ...initial, reduceMotion: true });
    await intersect(true);
    expect(document.activeElement).toBe(document.body);

    await click("load");

    expect(status()).toBe("loading");
    expect(document.activeElement).toBe(document.body);
  });

  it("does not retain a focus request while a manual load waits offscreen", async () => {
    await mount({ ...initial, reduceMotion: true });
    const trigger = container.querySelector<HTMLButtonElement>('button[data-scene-action="load"]')!;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    await click("load");
    expect(imports).toBe(0);
    expect(trigger.isConnected).toBe(true);
    expect(document.activeElement).toBe(trigger);

    await intersect(true);

    expect(status()).toBe("loading");
    expect(trigger.isConnected).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it("renders an accessible responsive poster before effects and never imports offscreen", async () => {
    const html = renderToStaticMarkup(<WorkbenchScene snapshot={initial} />);
    expect(html).toContain("<picture"); expect(html).not.toContain("<canvas");
    await mount();
    expect(status()).toBe("poster"); expect(imports).toBe(0);
    expect(container.querySelector("[role=status]")?.textContent).toContain("static preview");
    expect(container.querySelector("img")?.getAttribute("alt")).toContain("miniature knowledge studio");
    expect(container.querySelector("source")?.getAttribute("media")).toBe("(max-width: 767px)");
    expect(container.querySelector("img")?.getAttribute("width")).toBe("1600");
    expect(container.querySelector("img")?.getAttribute("height")).toBe("1000");
  });

  it("lazy-loads exactly one runtime attempt when visible and retains the poster while loading", async () => {
    await start(); await intersect(true);
    expect(imports).toBe(1); expect(requests).toHaveLength(1); expect(status()).toBe("loading");
    expect(container.querySelector("picture")).not.toBeNull();
    expect(requests[0].options.modelUrl).toMatch(/workbench\.glb/);
    expect(requests[0].options.signal.aborted).toBe(false);
    await ready(); expect(status()).toBe("ready"); expect(canvas()?.dataset.visible).toBe("true");
    expect(container.querySelector("[data-scene-host]")?.getAttribute("aria-hidden")).toBe("true");
    expect((container.querySelector("[data-scene-host]") as HTMLElement).style.pointerEvents).toBe("none");
  });

  it("uses a positive threshold to receive visible-area updates after zero-area edge contact", async () => {
    await mount();
    const observer = observers.find(value => !value.disconnected)!;
    expect(observer.options?.threshold).toBe(0.01);
    await act(async () => observer.callback([{ isIntersecting: true, intersectionRatio: 0 } as IntersectionObserverEntry], {} as IntersectionObserver));
    await flush(); expect(imports).toBe(0); expect(status()).toBe("poster");
    await intersect(true); expect(requests).toHaveLength(1);
  });

  it.each(["snapshot-motion", "media-motion", "save-data"])("defaults to static without importing for %s, allowing one manual override", async preference => {
    if (preference === "media-motion") Object.defineProperty(motion, "matches", { configurable: true, value: true });
    if (preference === "save-data") connection.saveData = true;
    await mount({ ...initial, reduceMotion: preference === "snapshot-motion" });
    await intersect(true);
    expect(status()).toBe("static"); expect(imports).toBe(0); expect(requests).toHaveLength(0);
    expect(container.textContent).toMatch(/reduced-motion|data-saving/);
    await click("load"); await ready();
    expect(status()).toBe("ready"); expect(requests).toHaveLength(1);
    const forwarded = JSON.parse(canvas()!.dataset.snapshot!);
    expect(forwarded.reduceMotion).toBe(preference !== "save-data");
    expect(browser.localStorage.length).toBe(0); expect(browser.sessionStorage.length).toBe(0);
  });

  it("does not bypass intersection or document visibility for a manual request", async () => {
    connection.saveData = true; hidden = true;
    await mount(); await click("load"); expect(imports).toBe(0);
    await intersect(true); expect(imports).toBe(0);
    await visibility(true); expect(requests).toHaveLength(1); expect(status()).toBe("loading");
  });

  it("keeps an explicit static choice in the mount without a visibility-triggered reload", async () => {
    await start(); const scene = await ready();
    await click("static");
    expect(status()).toBe("static"); expect(scene.disposals).toBe(1); expect(canvas()).toBeNull();
    expect(requests[0].options.signal.aborted).toBe(true);
    await visibility(false); await intersect(false); await visibility(true); await intersect(true);
    expect(requests).toHaveLength(1);
    await click("load"); expect(requests).toHaveLength(2);
  });

  it("stops a pending runtime after exactly eight seconds and ignores its late handle", async () => {
    await start();
    await act(async () => { await vi.advanceTimersByTimeAsync(7999); }); expect(status()).toBe("loading");
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(status()).toBe("timeout"); expect(requests[0].options.signal.aborted).toBe(true);
    expect(container.querySelector("picture")).not.toBeNull();
    const late = await ready();
    expect(late.disposals).toBe(1); expect(canvas()).toBeNull(); expect(status()).toBe("timeout");
  });

  it("includes a delayed module import in the same eight-second deadline", async () => {
    moduleGate = deferred<void>(); await mount(); await intersect(true);
    expect(imports).toBe(1); expect(status()).toBe("loading"); expect(requests).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); moduleGate.resolve(); }); await flush();
    expect(requests).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(status()).toBe("timeout"); expect(requests[0].options.signal.aborted).toBe(true);
  });

  it.each(["module", "runtime"])("rejects a late %s result even before a blocked timeout callback can run", async boundary => {
    let elapsed = 0;
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    if (boundary === "module") moduleGate = deferred<void>();
    await mount(); await intersect(true); expect(status()).toBe("loading");
    // Simulate synchronous work blocking the event loop: elapsed time advances,
    // but the timer task has not run before this promise's microtask continuation.
    elapsed = 8001;
    if (boundary === "module") {
      await act(async () => moduleGate.resolve()); await flush();
      expect(requests).toHaveLength(0);
    } else {
      const late = await ready();
      expect(late.disposals).toBe(1); expect(requests[0].options.signal.aborted).toBe(true);
    }
    expect(status()).toBe("timeout"); expect(canvas()).toBeNull();
  });

  it("does not create a runtime when its module resolves after timeout", async () => {
    moduleGate = deferred<void>(); await mount(); await intersect(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); }); expect(status()).toBe("timeout");
    await act(async () => moduleGate.resolve()); await flush();
    expect(requests).toHaveLength(0); expect(canvas()).toBeNull();
  });

  it("falls back on a module import failure without retrying automatically", async () => {
    moduleGate = deferred<void>(); await mount(); await intersect(true);
    expect(imports).toBe(1); expect(status()).toBe("loading");
    await act(async () => moduleGate.reject(new Error("module download failed"))); await flush();
    expect(status()).toBe("error"); expect(container.textContent).toContain("could not load");
    expect(requests).toHaveLength(0);
    await intersect(false); await intersect(true); expect(imports).toBe(1);
  });

  it.each([
    ["MODEL_HTTP_404", "could not load"],
    ["Error creating WebGL context.", "unavailable in this browser"],
    ["MODEL_MISSING_NODE_MG_Desk", "scene is incomplete"],
  ])("explains runtime failure %s while preserving the HTML fallback", async (message, text) => {
    await start(); await act(async () => requests[0].result.reject(new Error(message))); await flush();
    expect(status()).toBe("error"); expect(container.textContent).toContain(text);
    expect(container.querySelector("picture")).not.toBeNull(); expect(canvas()).toBeNull();
    expect(requests[0].options.signal.aborted).toBe(true);
    await intersect(false); await intersect(true); await visibility(false); await visibility(true);
    expect(requests).toHaveLength(1);
  });

  it.each(["context-lost", "render-error"] as const)("handles %s after ready, disposes, and requires an explicit retry", async reason => {
    await start(); const scene = await ready();
    await act(async () => requests[0].options.onFailure(reason)); await flush();
    expect(status()).toBe("error"); expect(scene.disposals).toBe(1); expect(canvas()).toBeNull();
    expect(container.textContent).toContain(reason === "context-lost" ? "was interrupted" : "could not load");
    await act(async () => requests[0].options.onFailure(reason)); expect(scene.disposals).toBe(1);
    await intersect(true); expect(requests).toHaveLength(1);
    await click("retry"); expect(requests).toHaveLength(2);
  });

  it("makes rapid retry clicks one new attempt and ignores old failures after replacement", async () => {
    await start();
    await act(async () => requests[0].result.reject(new Error("failed"))); await flush();
    const retry = container.querySelector<HTMLButtonElement>('button[data-scene-action="retry"]')!;
    await act(async () => { retry.click(); retry.click(); }); await flush();
    expect(requests).toHaveLength(2); expect(status()).toBe("loading");
    await act(async () => requests[0].options.onFailure("context-lost"));
    expect(status()).toBe("loading"); await ready(1); expect(status()).toBe("ready");
  });

  it("never lets stale handles insert a canvas into the new attempt", async () => {
    await start(); await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    await click("retry"); await ready(1);
    const current = canvas(); const late = await ready(0);
    expect(late.disposals).toBe(1); expect(canvas()).toBe(current);
    expect(container.querySelectorAll("canvas")).toHaveLength(1); expect(status()).toBe("ready");
  });

  it("uses intersection AND document visibility regardless of callback ordering", async () => {
    await start(); await ready();
    await visibility(false); expect(canvas()?.dataset.visible).toBe("false");
    await intersect(true); expect(canvas()?.dataset.visible).toBe("false");
    await intersect(false); await visibility(true); expect(canvas()?.dataset.visible).toBe("false");
    await intersect(true); expect(canvas()?.dataset.visible).toBe("true");
    expect(requests).toHaveLength(1);
  });

  it("settles an offscreen load as hidden, without restarting its deadline", async () => {
    await start(); await intersect(false); await ready();
    expect(status()).toBe("ready"); expect(canvas()?.dataset.visible).toBe("false");
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); }); expect(status()).toBe("ready");
  });

  it("forwards the newest controlled snapshot after pending load and subsequent changes without rebuilding", async () => {
    await start();
    const next: SceneSnapshot = { ...initial, feature: "answer", captured: true, taskDone: true, citationId: "cite-filing", paused: true };
    await mount(next); await ready(); expect(JSON.parse(canvas()!.dataset.snapshot!)).toEqual(next);
    expect(container.textContent).toContain("Animation paused");
    await mount(initial); expect(JSON.parse(canvas()!.dataset.snapshot!)).toEqual(initial);
    expect(requests).toHaveLength(1);
  });

  it("updates reduced-motion media changes and never weakens the snapshot restriction", async () => {
    await start(); await ready();
    await act(async () => { Object.defineProperty(motion, "matches", { configurable: true, value: true }); motion.dispatchEvent(new Event("change")); }); await flush();
    expect(JSON.parse(canvas()!.dataset.snapshot!).reduceMotion).toBe(true);
    await mount({ ...initial, reduceMotion: true });
    await act(async () => { Object.defineProperty(motion, "matches", { configurable: true, value: false }); motion.dispatchEvent(new Event("change")); }); await flush();
    expect(JSON.parse(canvas()!.dataset.snapshot!).reduceMotion).toBe(true); expect(requests).toHaveLength(1);
  });

  it("reacts to data-saving before an attempt and does not save local preferences", async () => {
    await mount();
    await act(async () => { connection.saveData = true; connection.dispatchEvent(new Event("change")); }); await flush();
    await intersect(true); expect(status()).toBe("static"); expect(imports).toBe(0);
    expect(container.textContent).toContain("data-saving");
  });

  it("updates theme and inherited page language without a new renderer", async () => {
    await start(); await ready();
    await act(async () => { document.documentElement.classList.add("dark"); container.lang = "zh-CN"; }); await flush();
    expect(JSON.parse(canvas()!.dataset.snapshot!).dark).toBe(true);
    expect(container.textContent).toContain("3D 工作台已就绪");
    expect(container.querySelector("img")?.alt).toContain("微缩知识工作室");
    await act(async () => document.documentElement.classList.remove("dark")); await flush();
    expect(JSON.parse(canvas()!.dataset.snapshot!).dark).toBe(false); expect(requests).toHaveLength(1);
  });

  it("aborts on unmount, disconnects observations and removes preference/visibility listeners", async () => {
    const removeDocument = vi.spyOn(document, "removeEventListener");
    const removeMotion = vi.spyOn(motion, "removeEventListener");
    const removeConnection = vi.spyOn(connection, "removeEventListener");
    await start();
    await act(async () => root.unmount()); mounted = false;
    expect(requests[0].options.signal.aborted).toBe(true);
    expect(observers.every(observer => observer.disconnected)).toBe(true);
    expect(removeDocument.mock.calls.some(([type]) => type === "visibilitychange")).toBe(true);
    expect(removeMotion.mock.calls.some(([type]) => type === "change")).toBe(true);
    expect(removeConnection.mock.calls.some(([type]) => type === "change")).toBe(true);
    const late = await ready(); expect(late.disposals).toBe(1); expect(container.childElementCount).toBe(0);
  });

  it("disposes a ready handle once on unmount and leaves no timer behind", async () => {
    await start(); const scene = await ready();
    await act(async () => root.unmount()); mounted = false;
    expect(scene.disposals).toBe(1); expect(container.childElementCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores a late module resolution after unmount", async () => {
    moduleGate = deferred<void>(); await mount(); await intersect(true);
    expect(imports).toBe(1); expect(status()).toBe("loading");
    await act(async () => root.unmount()); mounted = false;
    await act(async () => moduleGate.resolve()); await flush();
    expect(requests).toHaveLength(0); expect(container.childElementCount).toBe(0);
  });

  it("survives StrictMode subscription replay and rejects disconnected observer callbacks", async () => {
    await mount(initial, true); await intersect(true); await ready();
    expect(container.querySelectorAll("canvas")).toHaveLength(1); expect(requests).toHaveLength(1);
    await visibility(false);
    const stale = observers.find(observer => observer.disconnected);
    expect(stale).toBeDefined();
    await act(async () => stale!.callback([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(canvas()?.dataset.visible).toBe("false");
  });

  it("falls back to viewport measurements without IntersectionObserver and removes resize/scroll listeners", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const removeWindow = vi.spyOn(window, "removeEventListener");
    let inView = false;
    vi.spyOn(browser.HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width: 320, height: 200, top: inView ? 0 : 2000, bottom: inView ? 200 : 2200, left: 0, right: 320, x: 0, y: 0, toJSON() {} }) as DOMRect);
    await mount(); expect(imports).toBe(0);
    await act(async () => { inView = true; window.dispatchEvent(new Event("resize")); }); await flush();
    expect(requests).toHaveLength(1); await ready();
    await act(async () => { inView = false; window.dispatchEvent(new Event("scroll")); }); await flush();
    expect(canvas()?.dataset.visible).toBe("false");
    await act(async () => root.unmount()); mounted = false;
    expect(removeWindow.mock.calls.some(([type]) => type === "resize")).toBe(true);
    expect(removeWindow.mock.calls.some(([type]) => type === "scroll")).toBe(true);
  });
});
