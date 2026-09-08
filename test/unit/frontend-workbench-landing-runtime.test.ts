// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DOMRect, HTMLElement, ResizeObserver } from "happy-dom";
import {
  Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, OrthographicCamera, Scene, Texture, Vector3,
} from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { demoReducer, initialDemoState, type DemoEvent, type FeatureId } from "../../frontend/pages/workbench-landing/workbench-demo-state";

// Root tsc is a Worker project. Keep the DOM production graph in typecheck:landing;
// this computed import still executes the actual runtime in Vitest, without adding
// lib.dom globals that conflict with Worker's HTMLRewriter and DOMPurify tests.
const runtimeModule = "../../frontend/pages/workbench-landing/workbench-scene-runtime";
const { createWorkbenchScene } = await import(runtimeModule);
type ResizeObserverCallback = (entries: readonly unknown[], observer: ResizeObserver) => void;

// Match the existing frontend harness: Workerd lacks node:vm constructors.
// No script is evaluated; the real Happy DOM tree/event implementation remains in use.
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

const boundary = vi.hoisted(() => ({ renderers: [] as any[], parse: vi.fn(), failFirstDraw: false }));
vi.mock("three", async (original) => {
  const real = await original<typeof import("three")>();
  return {
    ...real,
    WebGLRenderer: class {
      domElement = browser.document.createElement("canvas");
      shadowMap = { enabled: false };
      info = { render: { calls: 17, triangles: 1234 }, memory: { geometries: 8, textures: 2 } };
      pixelRatio = 1;
      setSize = vi.fn();
      setPixelRatio = vi.fn((value: number) => { this.pixelRatio = value; });
      getPixelRatio = () => this.pixelRatio;
      render = vi.fn(() => { if (boundary.failFirstDraw) throw new Error("first draw failed"); });
      dispose = vi.fn();
      forceContextLoss = vi.fn();
      constructor() { boundary.renderers.push(this); }
    },
  };
});
vi.mock("three/addons/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class { parseAsync = boundary.parse; },
}));

const snapshot = {
  feature: null as FeatureId | null, captured: false, taskDone: false, citationId: null as string | null,
  paused: false, reduceMotion: false, dark: false,
};

function model(): GLTF {
  const scene = new Group();
  const roots = ["MG_Desk", "MG_Inbox", "MG_Library", "MG_Query", "MG_Board", "MG_Updates", "MG_Assistant"];
  roots.forEach((name, i) => {
    const group = new Group(); group.name = name;
    group.position.set(i * 2 - 6, i % 2, 1);
    group.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial({ color: 0x6b9982 })));
    scene.add(group);
  });
  for (const [name, root] of [["MG_CaptureCard", 1], ["MG_CitationCard", 3], ["MG_TaskCard", 4]] as const) {
    const card = new Group();
    card.add(new Mesh(new BoxGeometry(0.5, 0.1, 0.6), new MeshStandardMaterial()));
    if (name === "MG_CaptureCard") card.position.set(0.02, 0.25, 0.06);
    if (name === "MG_CitationCard") card.position.set(-0.37, 0.48, 0.47);
    if (name === "MG_TaskCard") card.position.set(-0.61, 1.43, 0.108);
    card.name = name; scene.children[root].add(card);
  }
  return { scene, scenes: [scene], animations: [], cameras: [], asset: { version: "2.0" }, parser: {} as GLTF["parser"], userData: {} };
}

let browser: InstanceType<typeof Window>;
let host: HTMLElement;
let controller: AbortController;
let onFailure: ReturnType<typeof vi.fn<(reason: "context-lost" | "render-error") => void>>;
let gltf: GLTF;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let now: number;
let observers: { callback: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }[];
let fetchModel: ReturnType<typeof vi.fn>;
const live: { dispose(): void }[] = [];

beforeEach(() => {
  browser = new Window({ url: "http://localhost/" });
  vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document);
  vi.stubGlobal("location", browser.location);
  host = browser.document.createElement("div") as unknown as HTMLElement;
  browser.document.body.append(host as any);
  vi.spyOn(host, "getBoundingClientRect").mockReturnValue({ width: 900, height: 600 } as DOMRect);
  controller = new AbortController(); onFailure = vi.fn(); gltf = model();
  boundary.renderers.length = 0; boundary.failFirstDraw = false; boundary.parse.mockReset().mockResolvedValue(gltf);
  fetchModel = vi.fn().mockResolvedValue(new Response(new ArrayBuffer(20)));
  vi.stubGlobal("fetch", fetchModel);
  frames = new Map(); nextFrame = 0; now = 0; observers = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback); return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("ResizeObserver", class {
    disconnect = vi.fn(); observe = vi.fn();
    constructor(callback: ResizeObserverCallback) { observers.push({ callback, disconnect: this.disconnect }); }
  });
});
afterEach(() => {
  live.splice(0).forEach(handle => handle.dispose());
  browser.happyDOM.abort(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
async function create() {
  const handle = await createWorkbenchScene({ host, modelUrl: "/fixture.glb", signal: controller.signal, onFailure });
  live.push(handle); return handle;
}
function tick(ms = 400) {
  now += ms;
  const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now));
}
function rendered() {
  const renderer = boundary.renderers.at(-1)!;
  const [scene, camera] = renderer.render.mock.calls.at(-1) as [Scene, OrthographicCamera];
  return { renderer, scene, camera };
}

describe("workbench scene lifecycle", () => {
  // Catches the old all-clear/null-feature sentinel resetting a normal panel close.
  it("preserves the assistant turn across reducer feature close/open in default cycle zero", async () => {
    const handle = await create();
    const assistant = gltf.scene.getObjectByName("MG_Assistant")!;
    let state = demoReducer(initialDemoState(), { type: "open", feature: "capture" });
    handle.update({ ...snapshot, feature: state.activeFeature }); tick();
    const turn = assistant.quaternion.toArray();
    expect(assistant.rotation.y).toBeCloseTo(0.24);
    state = demoReducer(state, { type: "close" });
    handle.update({ ...snapshot, feature: state.activeFeature, cycleId: 0 });
    expect(assistant.quaternion.toArray()).toEqual(turn);
    tick();
    state = demoReducer(state, { type: "open", feature: "library" });
    handle.update({ ...snapshot, feature: state.activeFeature }); tick();
    expect(assistant.quaternion.toArray()).toEqual(turn);
    const count = rendered().renderer.render.mock.calls.length;
    handle.update({ ...snapshot, feature: state.activeFeature, cycleId: 0 });
    expect(rendered().renderer.render).toHaveBeenCalledTimes(count);
    expect(frames.size).toBe(0);
  });

  // Catches missing an added epoch key in snapshot equality, or resetting only when flags change.
  it("resets on epoch-only updates and cancels an unfinished turn without guessing from flags", async () => {
    const handle = await create();
    const assistant = gltf.scene.getObjectByName("MG_Assistant")!;
    const capture = gltf.scene.getObjectByName("MG_CaptureCard")!;
    const active = { ...snapshot, feature: "capture" as const, captured: true };
    handle.update(active); tick(90);
    expect(assistant.rotation.y).toBeGreaterThan(0);
    handle.update({ ...active, cycleId: 1 });
    expect(assistant.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(capture.position.toArray()).toEqual([0.02, 0.25, 0.06]);
    expect(frames.size).toBe(0);
    handle.update({ ...active, cycleId: 2 }); tick();
    expect(assistant.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(frames.size).toBe(0);
  });

  // Catches confusing the reducer's capture-feature replay with an ordinary feature update.
  it.each([400, 90])("restores and rearms actors on reducer replay after %i ms of motion", async elapsed => {
    const actors = ["MG_CaptureCard", "MG_TaskCard", "MG_CitationCard", "MG_Assistant"].map(name => gltf.scene.getObjectByName(name)!);
    actors.forEach((actor, i) => { actor.rotation.set(0.1, i * 0.17, -0.2); actor.scale.set(0.8, 1.3, 1.1); });
    const original = actors.map(actor => ({ p: actor.position.toArray(), q: actor.quaternion.toArray(), s: actor.scale.toArray() }));
    const handle = await create();
    let state = initialDemoState(), cycleId = 0;
    function dispatch(event: DemoEvent) {
      state = demoReducer(state, event);
      if (event.type === "start" || event.type === "replay") cycleId++;
      const next = { ...snapshot, feature: state.activeFeature, captured: state.captured, taskDone: state.taskDone, citationId: state.citationId, paused: state.paused, cycleId };
      handle.update(next); return next;
    }
    dispatch({ type: "start" });
    dispatch({ type: "capture" }); tick(elapsed);
    for (const event of [{ type: "next" }, { type: "next" }, { type: "next" }, { type: "complete-task" }, { type: "next" }] as const) {
      dispatch(event); if (elapsed === 400) tick();
    }
    expect(actors[3].quaternion.toArray()).not.toEqual(original[3].q);
    const replay = dispatch({ type: "replay" });
    expect(replay).toMatchObject({ feature: "capture", captured: false, taskDone: false, citationId: null, cycleId: 2 });
    actors.forEach((actor, i) => {
      expect(actor.position.toArray()).toEqual(original[i].p);
      expect(actor.quaternion.toArray()).toEqual(original[i].q);
      expect(actor.scale.toArray()).toEqual(original[i].s);
    });
    expect(frames.size).toBe(0);
    tick(); expect(actors[3].quaternion.toArray()).toEqual(original[3].q);
    dispatch({ type: "capture" }); tick(190);
    expect(actors[3].quaternion.toArray()).not.toEqual(original[3].q);
    tick(200);
    const nextTurn = actors[3].quaternion.toArray();
    dispatch({ type: "next" }); tick();
    expect(actors[3].quaternion.toArray()).toEqual(nextTurn);
    expect(frames.size).toBe(0);
  });

  // Guards the shared snap path: motion preferences must settle every actor, not only the camera.
  it.each(["paused", "reduceMotion"] as const)("applies all end poses immediately when %s interrupts motion", async preference => {
    const handle = await create();
    const active = { ...snapshot, feature: "action" as const, captured: true, taskDone: true, citationId: "citation-a" };
    handle.update(active); tick(90);
    handle.update({ ...active, [preference]: true });
    expect(gltf.scene.getObjectByName("MG_CaptureCard")!.position.y).toBeCloseTo(0.11);
    expect(gltf.scene.getObjectByName("MG_TaskCard")!.position.x).toBeCloseTo(0.585);
    expect(gltf.scene.getObjectByName("MG_CitationCard")!.scale.x).toBeCloseTo(1.12);
    expect(gltf.scene.getObjectByName("MG_Assistant")!.rotation.y).toBeCloseTo(0.24);
    expect(frames.size).toBe(0);
    handle.update(active); tick();
    expect(frames.size).toBe(0);
    const center = new Box3().setFromObject(gltf.scene.getObjectByName("MG_Board")!).getCenter(new Vector3()).project(rendered().camera);
    expect(center.x).toBeCloseTo(0, 6); expect(center.y).toBeCloseTo(0, 6);
  });

  // Catches jumps on retarget, stale queued object targets, and incidental updates extending object duration.
  it("coalesces rapid object updates from current poses without restarting unchanged targets", async () => {
    const handle = await create();
    const card = gltf.scene.getObjectByName("MG_TaskCard")!;
    handle.update({ ...snapshot, feature: "action", taskDone: true }); tick(90);
    const beforeRetarget = card.position.clone();
    handle.update({ ...snapshot, feature: "action", captured: true, citationId: "citation-a" });
    expect(card.position.equals(beforeRetarget)).toBe(true);
    tick(90);
    const finalState = { ...snapshot, feature: "answer" as const, taskDone: true, captured: true, citationId: "citation-b" };
    handle.update(finalState); tick(190);
    const mid = card.position.x;
    handle.update({ ...finalState, dark: true, citationId: "citation-c" });
    expect(card.position.x).toBe(mid); expect(frames.size).toBe(1);
    tick(200);
    expect(card.position.x).toBeCloseTo(0.585);
    expect(gltf.scene.getObjectByName("MG_CaptureCard")!.position.y).toBeCloseTo(0.11);
    expect(gltf.scene.getObjectByName("MG_CitationCard")!.scale.x).toBeCloseTo(1.12);
    expect(frames.size).toBe(0);
  });

  // Guards against a queued frame mutating retired GLTF nodes or reviving diagnostic attributes.
  it.each(["dispose", "abort", "context-lost"])("does not mutate actors after %s during motion", async finish => {
    const handle = await create();
    handle.update({ ...snapshot, captured: true, taskDone: true, citationId: "citation-a" }); tick(90);
    const queued = [...frames.values()][0];
    if (finish === "dispose") handle.dispose();
    if (finish === "abort") controller.abort();
    if (finish === "context-lost") host.querySelector("canvas")!.dispatchEvent(new browser.Event("webglcontextlost", { cancelable: true }));
    const card = gltf.scene.getObjectByName("MG_TaskCard")!, position = card.position.toArray();
    const count = rendered().renderer.render.mock.calls.length;
    queued(now + 400); handle.update(snapshot); handle.setVisible(true);
    expect(card.position.toArray()).toEqual(position);
    expect(rendered().renderer.render).toHaveBeenCalledTimes(count);
    expect(frames.size).toBe(0); expect(host.querySelector("canvas")).toBeNull();
    expect(host.hasAttribute("data-scene-frames")).toBe(false);
  });

  // Catches camera focus derived before descendant motion, including citation changes without a feature change.
  it("focuses the current world bounds after animated descendants change the selected feature", async () => {
    gltf.scene.position.set(12, -5, 20); gltf.scene.rotation.y = 0.6; gltf.scene.scale.set(2, 3, 0.8);
    const query = gltf.scene.getObjectByName("MG_Query")!;
    const citation = gltf.scene.getObjectByName("MG_CitationCard")!;
    citation.position.set(4, 3, 2); citation.scale.set(2, 3, 1);
    const handle = await create();
    handle.update({ ...snapshot, feature: "answer" }); tick();
    handle.update({ ...snapshot, feature: "answer", citationId: "citation-a" }); tick();
    const center = new Box3().setFromObject(query).getCenter(new Vector3()).project(rendered().camera);
    expect(center.x).toBeCloseTo(0, 6); expect(center.y).toBeCloseTo(0, 6);
    expect(frames.size).toBe(0);
  });

  // Catches hidden updates retaining stale intermediate poses or drawing in the background.
  it.each(["viewport", "document", "zero-area"])("settles the newest transforms without rendering while %s is hidden", async hidden => {
    const handle = await create();
    handle.update({ ...snapshot, feature: "capture", captured: true }); tick(90);
    if (hidden === "viewport") handle.setVisible(false);
    if (hidden === "document") {
      Object.defineProperty(browser.document, "hidden", { configurable: true, value: true });
      browser.document.dispatchEvent(new browser.Event("visibilitychange"));
    }
    if (hidden === "zero-area") {
      vi.mocked(host.getBoundingClientRect).mockReturnValue({ width: 0, height: 0 } as DOMRect);
      observers[0].callback([], {} as ResizeObserver);
    }
    const renderer = rendered().renderer, count = renderer.render.mock.calls.length;
    handle.update({ ...snapshot, feature: "action", captured: true, taskDone: true, citationId: "citation-a" });
    expect(gltf.scene.getObjectByName("MG_CaptureCard")!.position.y).toBeCloseTo(0.11);
    expect(gltf.scene.getObjectByName("MG_TaskCard")!.position.x).toBeCloseTo(0.585);
    expect(gltf.scene.getObjectByName("MG_CitationCard")!.scale.x).toBeCloseTo(1.12);
    expect(frames.size).toBe(0); tick(); expect(renderer.render).toHaveBeenCalledTimes(count);
    handle.update({ ...snapshot, feature: "capture", cycleId: 1 });
    expect(gltf.scene.getObjectByName("MG_CaptureCard")!.position.y).toBe(0.25);
    expect(gltf.scene.getObjectByName("MG_TaskCard")!.position.x).toBe(-0.61);
    expect(gltf.scene.getObjectByName("MG_CitationCard")!.scale.x).toBe(1);
    expect(gltf.scene.getObjectByName("MG_Assistant")!.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    if (hidden === "viewport") handle.setVisible(true);
    if (hidden === "document") {
      Object.defineProperty(browser.document, "hidden", { configurable: true, value: false });
      browser.document.dispatchEvent(new browser.Event("visibilitychange"));
    }
    if (hidden === "zero-area") {
      vi.mocked(host.getBoundingClientRect).mockReturnValue({ width: 900, height: 600 } as DOMRect);
      observers[0].callback([], {} as ResizeObserver);
    }
    expect(renderer.render).toHaveBeenCalledTimes(count + 1); expect(frames.size).toBe(0);
  });

  // Catches a robot idle loop, a turn repeated on every update, or a replay that loses authored orientation.
  it("turns the assistant once briefly per replay without idle motion", async () => {
    const assistant = gltf.scene.getObjectByName("MG_Assistant")!;
    assistant.rotation.set(0.1, -0.3, 0.05);
    const origin = assistant.quaternion.clone();
    const handle = await create();
    tick(); expect(assistant.quaternion.toArray()).toEqual(origin.toArray());
    handle.update({ ...snapshot, feature: "capture" }); tick(190);
    expect(assistant.quaternion.angleTo(origin)).toBeGreaterThan(0.01);
    expect(assistant.quaternion.angleTo(origin)).toBeLessThan(0.3);
    const midTurn = assistant.quaternion.clone(); tick(200);
    expect(assistant.quaternion.angleTo(origin)).toBeGreaterThan(midTurn.angleTo(origin));
    const finalTurn = assistant.quaternion.toArray();
    handle.update({ ...snapshot, feature: "answer", citationId: "citation-a" }); tick();
    handle.update({ ...snapshot, feature: "action", captured: true, taskDone: true }); tick();
    expect(assistant.quaternion.toArray()).toEqual(finalTurn);
    const renders = rendered().renderer.render.mock.calls.length;
    tick(2000); expect(frames.size).toBe(0); expect(rendered().renderer.render).toHaveBeenCalledTimes(renders);
    handle.update({ ...snapshot, feature: "capture", cycleId: 1 });
    expect(assistant.quaternion.toArray()).toEqual(origin.toArray());
    handle.update({ ...snapshot, feature: "library", cycleId: 1 }); tick();
    expect(assistant.quaternion.toArray()).toEqual(finalTurn);
  });

  // Catches replay easing toward baseline instead of immediately restoring exact authored transforms.
  it("replay resets all card transforms exactly even during unfinished motion", async () => {
    const cards = ["MG_CaptureCard", "MG_TaskCard", "MG_CitationCard"].map(name => gltf.scene.getObjectByName(name)!);
    cards.forEach((card, i) => { card.rotation.set(0.11 * i, 0.17, -0.2); card.scale.set(0.8, 1.3, 1.1); });
    const original = cards.map(card => ({ p: card.position.toArray(), q: card.quaternion.toArray(), s: card.scale.toArray() }));
    const handle = await create();
    for (let cycle = 0; cycle < 3; cycle++) {
      handle.update({ ...snapshot, feature: "action", captured: true, taskDone: true, citationId: "citation-a", cycleId: cycle });
      tick(cycle === 1 ? 90 : 400);
      handle.update({ ...snapshot, feature: "capture", cycleId: cycle + 1 });
      cards.forEach((card, i) => {
        expect(card.position.toArray()).toEqual(original[i].p);
        expect(card.quaternion.toArray()).toEqual(original[i].q);
        expect(card.scale.toArray()).toEqual(original[i].s);
      });
      expect(frames.size).toBe(0);
      tick();
    }
  });

  // Catches a citation panel that never emphasizes its descendant group, or compounds scale on citation switches.
  it("emphasizes an open citation and restores its authored local transform when closed", async () => {
    const card = gltf.scene.getObjectByName("MG_CitationCard")!;
    card.scale.set(1.2, 0.8, 1.1); card.rotation.set(0.1, 0.2, -0.1);
    const original = { position: card.position.toArray(), scale: card.scale.toArray(), quaternion: card.quaternion.toArray() };
    const handle = await create();
    handle.update({ ...snapshot, citationId: "citation-a" }); tick(190);
    expect(card.scale.x).toBeGreaterThan(1.2); expect(card.scale.x).toBeLessThan(1.344);
    tick(200);
    expect(card.scale.x).toBeCloseTo(1.344); expect(card.position.y).toBeCloseTo(0.54);
    handle.update({ ...snapshot, citationId: "citation-b" }); tick();
    expect(card.scale.x).toBeCloseTo(1.344);
    handle.update(snapshot); tick();
    expect(card.position.toArray()).toEqual(original.position);
    expect(card.scale.toArray()).toEqual(original.scale);
    expect(card.quaternion.toArray()).toEqual(original.quaternion);
    expect(frames.size).toBe(0);
  });

  // Catches nudging the whole board or stacking completion offsets instead of moving the card to column four.
  it("moves the task group to the fourth column without accumulating offsets", async () => {
    const card = gltf.scene.getObjectByName("MG_TaskCard")!, board = card.parent!;
    const boardOrigin = board.position.clone();
    const handle = await create();
    handle.update({ ...snapshot, taskDone: true }); tick(190);
    expect(card.position.x).toBeGreaterThan(-0.61); expect(card.position.x).toBeLessThan(0.585);
    tick(200);
    expect(card.position.x).toBeCloseTo(0.585);
    expect(card.position.y).toBe(1.43); expect(card.position.z).toBe(0.108);
    handle.update({ ...snapshot, taskDone: true, dark: true }); tick();
    expect(card.position.x).toBeCloseTo(0.585);
    expect(board.position.equals(boardOrigin)).toBe(true);
    expect(frames.size).toBe(0);
  });

  // Catches moving a material mesh instead of its stable card group, or not animating capture at all.
  it("moves capture descendants from above the tray into it, then stops", async () => {
    const card = gltf.scene.getObjectByName("MG_CaptureCard")!;
    const inbox = card.parent!;
    inbox.rotation.z = 0.3; inbox.scale.set(2, 3, 1);
    const handle = await create();
    const originalWorld = card.children[0].getWorldPosition(new Vector3());
    handle.update({ ...snapshot, captured: true });
    expect(frames.size).toBe(1);
    tick(190);
    expect(card.position.y).toBeLessThan(0.25);
    expect(card.position.y).toBeGreaterThan(0.11);
    tick(200);
    expect(card.position.x).toBe(0.02); expect(card.position.y).toBeCloseTo(0.11); expect(card.position.z).toBe(0.06);
    const expectedWorld = inbox.localToWorld(new Vector3(0.02, 0.11, 0.06));
    expect(card.children[0].getWorldPosition(new Vector3()).distanceTo(expectedWorld)).toBeLessThan(1e-8);
    expect(expectedWorld.distanceTo(originalWorld)).toBeGreaterThan(0.1);
    expect(card.children[0].position.toArray()).toEqual([0, 0, 0]);
    expect(frames.size).toBe(0);
  });

  // Catches an ambiguous role lookup silently targeting the wrong object, or an empty model producing NaN cameras.
  it.each(["duplicate-role", "empty-geometry", "empty-feature", "nonfinite-geometry"])("rejects malformed scene bounds/roles: %s", async failure => {
    if (failure === "duplicate-role") { const duplicate = new Group(); duplicate.name = "MG_Query"; gltf.scene.add(duplicate); }
    if (failure === "empty-geometry") gltf.scene.traverse(node => { const mesh = node as Mesh; if (mesh.geometry) mesh.geometry.deleteAttribute("position"); });
    if (failure === "empty-feature") gltf.scene.getObjectByName("MG_Library")!.clear();
    if (failure === "nonfinite-geometry") gltf.scene.position.x = Infinity;
    await expect(create()).rejects.toThrow();
    expect(host.querySelector("canvas")).toBeNull();
  });

  // Catches aborting a still-downloading model continuing to the parser.
  it.each(["fetch", "body"])("aborts pending %s before parsing", async stage => {
    if (stage === "fetch") fetchModel.mockImplementation(() => new Promise(() => {}));
    else fetchModel.mockResolvedValue({ ok: true, arrayBuffer: () => new Promise(() => {}) });
    const pending = create();
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve(); controller.abort(); await rejected;
    expect(fetchModel).toHaveBeenCalledWith("/fixture.glb", { signal: controller.signal });
    expect(boundary.parse).not.toHaveBeenCalled();
    expect(boundary.renderers).toHaveLength(0);
  });

  // Catches resize-time GPU failures escaping the same static fallback used for draw errors.
  it("contains renderer resize failures after initialization", async () => {
    await create();
    boundary.renderers[0].setSize.mockImplementation(() => { throw new Error("resize failed"); });
    expect(() => observers[0].callback([], {} as ResizeObserver)).not.toThrow();
    expect(onFailure).toHaveBeenCalledExactlyOnceWith("render-error");
    expect(host.querySelector("canvas")).toBeNull();
  });

  // Catches releasing GPU texture wrappers but retaining their decoded CPU-side bitmap.
  it("closes a shared decoded bitmap once and releases the renderer context", async () => {
    const bitmap = { close: vi.fn() };
    const material = (gltf.scene.children[0].children[0] as Mesh).material as MeshStandardMaterial;
    material.map = new Texture(); material.emissiveMap = new Texture();
    material.map.source.data = bitmap; material.emissiveMap.source.data = bitmap;
    const handle = await create(); handle.dispose(); handle.dispose();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(boundary.renderers[0].forceContextLoss).toHaveBeenCalledTimes(1);
  });

  // Catches leaking diagnostics into the production experience.
  it("does not publish DOM diagnostics outside DEV", async () => {
    vi.stubEnv("DEV", false);
    const handle = await create(); handle.update({ ...snapshot, dark: true });
    expect(host.getAttributeNames().filter(name => name.startsWith("data-scene-"))).toEqual([]);
  });
  // Catches an initialization exception being swallowed into a seemingly ready, already disposed handle.
  it("rejects if the first draw fails, without retaining a canvas or abort listener", async () => {
    boundary.failFirstDraw = true;
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await expect(create()).rejects.toThrow();
    expect(host.querySelector("canvas")).toBeNull();
    expect(boundary.renderers[0].dispose).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalled();
  });

  // Catches no-op snapshots or zero-area hosts starting transitions that can never be displayed.
  it("does no work for repeated snapshots or a zero-area host", async () => {
    const handle = await create();
    const renderer = boundary.renderers[0], count = renderer.render.mock.calls.length;
    handle.update(snapshot); handle.update({ ...snapshot });
    expect(renderer.render).toHaveBeenCalledTimes(count);
    vi.mocked(host.getBoundingClientRect).mockReturnValue({ width: 0, height: 0 } as DOMRect);
    observers[0].callback([], {} as ResizeObserver);
    handle.update({ ...snapshot, feature: "answer" });
    expect(frames.size).toBe(0);
    expect(renderer.render).toHaveBeenCalledTimes(count);
  });

  // Catches page visibility and viewport visibility accidentally overriding each other.
  it("stops while the document is hidden even when the viewport says visible", async () => {
    const handle = await create();
    handle.update({ ...snapshot, feature: "capture" });
    Object.defineProperty(browser.document, "hidden", { configurable: true, value: true });
    browser.document.dispatchEvent(new browser.Event("visibilitychange"));
    handle.setVisible(true);
    expect(frames.size).toBe(0);
    const renderer = boundary.renderers[0], count = renderer.render.mock.calls.length;
    handle.update({ ...snapshot, feature: "answer" }); tick();
    expect(renderer.render).toHaveBeenCalledTimes(count);
    handle.setVisible(false);
    Object.defineProperty(browser.document, "hidden", { configurable: true, value: false });
    browser.document.dispatchEvent(new browser.Event("visibilitychange"));
    expect(renderer.render).toHaveBeenCalledTimes(count);
    handle.setVisible(true);
    expect(renderer.render.mock.calls.length).toBeGreaterThan(count);
  });

  // Catches holding the caller open until an unabortable GLTF parser finishes.
  it("settles abort promptly while parse is pending, then releases its late result", async () => {
    let finish!: (value: GLTF) => void;
    let parsing!: () => void;
    const entered = new Promise<void>(resolve => { parsing = resolve; });
    boundary.parse.mockImplementation(() => { parsing(); return new Promise<GLTF>(resolve => { finish = resolve; }); });
    let error: unknown;
    const pending = create().catch(value => { error = value; });
    await entered; controller.abort();
    try { await vi.waitFor(() => expect(error).toMatchObject({ name: "AbortError" }), { timeout: 100 }); }
    finally { finish(gltf); await pending; }
    expect(host.querySelector("canvas")).toBeNull();
  });
  // Catches context loss/render exceptions keeping a live canvas or scheduling more GPU work.
  it.each(["context-lost", "render-error"] as const)("reports %s once and releases the failed scene", async reason => {
    const handle = await create(); tick();
    const renderer = boundary.renderers[0];
    handle.update({ ...snapshot, feature: "capture" });
    if (reason === "context-lost") {
      const event = new browser.Event("webglcontextlost", { cancelable: true });
      renderer.domElement.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    } else {
      renderer.render.mockImplementation(() => { throw new Error("GPU draw failed"); });
      expect(() => tick(100)).not.toThrow();
    }
    handle.update({ ...snapshot, feature: "answer" }); handle.setVisible(true); tick();
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(reason);
    expect(frames.size).toBe(0);
    expect(host.querySelector("canvas")).toBeNull();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  // Catches multiplicative theme drift or reloading/reallocating the model when theme changes.
  it("changes theme in place and restores original material colors without drift", async () => {
    const material = (gltf.scene.children[0].children[0] as Mesh).material as MeshStandardMaterial;
    const color = material.color.clone();
    const handle = await create();
    const background = (rendered().scene.background as import("three").Color).clone();
    handle.update({ ...snapshot, dark: true });
    expect(material.color.equals(color)).toBe(false);
    expect((rendered().scene.background as import("three").Color).equals(background)).toBe(false);
    for (let i = 0; i < 3; i++) { handle.update(snapshot); handle.update({ ...snapshot, dark: true }); }
    handle.update(snapshot);
    expect(material.color.equals(color)).toBe(true);
    expect(boundary.parse).toHaveBeenCalledTimes(1);
    expect(boundary.renderers).toHaveLength(1);
  });

  // Catches synthetic frame counters, stale metrics after disposal, and statistics-only RAFs.
  it("publishes DEV metrics only from normal draws and removes all metrics on dispose", async () => {
    const handle = await create();
    expect(host.getAttribute("data-scene-draw-calls")).toBe("17");
    expect(host.getAttribute("data-scene-triangles")).toBe("1234");
    expect(host.getAttribute("data-scene-geometries")).toBe("8");
    expect(host.getAttribute("data-scene-textures")).toBe("2");
    expect(host.getAttribute("data-scene-frames")).toBe("1");
    expect(Number(host.getAttribute("data-scene-dpr"))).toBe(boundary.renderers[0].getPixelRatio());
    tick(); expect(host.getAttribute("data-scene-frames")).toBe("1");
    handle.dispose();
    expect(host.getAttributeNames().filter(name => name.startsWith("data-scene-"))).toEqual([]);
    expect(frames.size).toBe(0);
  });
  // Catches hard-coded coordinates/frusta clipping transformed models in portrait or landscape.
  it.each([[900, 600], [320, 720]])("fits real transformed geometry at %sx%s", async (width, height) => {
    vi.mocked(host.getBoundingClientRect).mockReturnValue({ width, height } as DOMRect);
    gltf.scene.position.set(40, -12, 7); gltf.scene.scale.set(2, 3, 0.5); gltf.scene.rotation.y = 0.4;
    await create(); tick();
    const { camera } = rendered();
    const bounds = new Box3().setFromObject(gltf.scene);
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const projected = new Vector3(x, y, z).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(0.96);
      expect(Math.abs(projected.y)).toBeLessThan(0.96);
      expect(Math.abs(projected.z)).toBeLessThan(1);
    }
    expect((camera.right - camera.left) / (camera.top - camera.bottom)).toBeCloseTo(width / height);
  });

  // Catches focus aimed at local origin instead of the named role's world bounds, or queued stale transitions.
  it("replaces an in-flight focus with the newest role and stops at its world center", async () => {
    gltf.scene.position.set(20, 10, -5); gltf.scene.rotation.y = 0.7;
    const handle = await create(); tick();
    handle.update({ ...snapshot, feature: "capture" }); tick(120);
    handle.update({ ...snapshot, feature: "answer" });
    expect(frames.size).toBe(1);
    tick(400);
    const { camera } = rendered();
    const center = new Box3().setFromObject(gltf.scene.getObjectByName("MG_Query")!).getCenter(new Vector3()).project(camera);
    expect(center.x).toBeCloseTo(0); expect(center.y).toBeCloseTo(0);
    expect(frames.size).toBe(0);
  });

  // Catches background work, ignored latest state on resume, and endless frames after pause/reduced motion.
  it("cancels hidden or paused frames and resumes only the latest snapshot", async () => {
    const handle = await create(); tick();
    handle.update({ ...snapshot, feature: "capture" });
    expect(frames.size).toBe(1);
    handle.setVisible(false); expect(frames.size).toBe(0);
    const renderer = boundary.renderers[0], count = renderer.render.mock.calls.length;
    handle.update({ ...snapshot, feature: "answer", dark: true });
    observers[0].callback([], {} as ResizeObserver); tick();
    expect(renderer.render).toHaveBeenCalledTimes(count);
    handle.setVisible(true); tick();
    const center = new Box3().setFromObject(gltf.scene.getObjectByName("MG_Query")!).getCenter(new Vector3()).project(rendered().camera);
    expect(center.x).toBeCloseTo(0); expect(center.y).toBeCloseTo(0);
    handle.update({ ...snapshot, feature: "action" });
    handle.update({ ...snapshot, feature: "action", paused: true });
    expect(frames.size).toBe(0);
    handle.update({ ...snapshot, feature: "library", reduceMotion: true });
    expect(frames.size).toBe(0);
  });

  // Catches unbounded retina GPU load and failure to refit after a resize.
  it("bounds DPR by viewport and updates aspect on resize", async () => {
    Object.defineProperty(browser, "devicePixelRatio", { configurable: true, value: 3 });
    Object.defineProperty(browser, "innerWidth", { configurable: true, value: 1200 });
    await create(); tick();
    expect(boundary.renderers[0].setPixelRatio).toHaveBeenLastCalledWith(1.5);
    Object.defineProperty(browser, "innerWidth", { configurable: true, value: 390 });
    vi.mocked(host.getBoundingClientRect).mockReturnValue({ width: 320, height: 500 } as DOMRect);
    observers[0].callback([], {} as ResizeObserver); tick();
    expect(boundary.renderers[0].setPixelRatio).toHaveBeenLastCalledWith(1);
    const { camera } = rendered();
    expect((camera.right - camera.left) / (camera.top - camera.bottom)).toBeCloseTo(320 / 500);
    expect(boundary.renderers[0].shadowMap.enabled).toBe(false);
    expect(frames.size).toBe(0);
  });
  // Catches accepting failed HTTP/parse/node contracts or retaining resources on initialization failure.
  it.each(["http", "network", "parse", "missing-root", "missing-card", "renderer"])("cleans up initialization failure: %s", async failure => {
    const mesh = gltf.scene.children[0].children[0] as Mesh;
    const released = vi.fn(); mesh.geometry.addEventListener("dispose", released);
    if (failure === "http") fetchModel.mockResolvedValue(new Response("missing", { status: 404 }));
    if (failure === "network") fetchModel.mockRejectedValue(new Error("offline"));
    if (failure === "parse") boundary.parse.mockRejectedValue(new Error("invalid GLB"));
    if (failure === "missing-root") gltf.scene.children[1].name = "wrong";
    if (failure === "missing-card") gltf.scene.getObjectByName("MG_CaptureCard")!.name = "wrong";
    if (failure === "renderer") vi.stubGlobal("ResizeObserver", class { constructor() { throw new Error("initialization failed"); } });
    await expect(create()).rejects.toThrow();
    expect(host.querySelector("canvas")).toBeNull();
    if (["missing-root", "missing-card", "renderer"].includes(failure)) expect(released).toHaveBeenCalledTimes(1);
    if (failure === "http") expect(boundary.parse).not.toHaveBeenCalled();
    if (failure === "renderer") expect(boundary.renderers[0].dispose).toHaveBeenCalledTimes(1);
  });
  // Catches retaining a settled attempt when its wrapper aborts/unmounts.
  it("aborting a resolved handle removes its canvas and stops later updates", async () => {
    const handle = await create();
    const renderer = boundary.renderers[0];
    controller.abort();
    const renders = renderer.render.mock.calls.length;
    handle.update({ ...snapshot, feature: "answer" }); handle.setVisible(true); tick();
    expect(host.querySelector("canvas")).toBeNull();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalledTimes(renders);
    expect(onFailure).not.toHaveBeenCalled();
  });
  // Catches starting network work for an already obsolete attempt.
  it("rejects an already aborted attempt before fetching or allocating a renderer", async () => {
    controller.abort();
    await expect(create()).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchModel).not.toHaveBeenCalled();
    expect(boundary.renderers).toHaveLength(0);
  });

  // Catches a late, non-cancelable parse attaching to an unmounted host or leaking its shared assets.
  it("rejects during parsing and disposes a late GLTF without attaching a canvas", async () => {
    let finish!: (value: GLTF) => void;
    let parsing!: () => void;
    const entered = new Promise<void>(resolve => { parsing = resolve; });
    boundary.parse.mockImplementation(() => { parsing(); return new Promise<GLTF>(resolve => { finish = resolve; }); });
    const mesh = gltf.scene.children[0].children[0] as Mesh;
    const material = mesh.material as MeshStandardMaterial;
    const texture = new Texture(); material.map = texture; material.emissiveMap = texture;
    gltf.scene.add(new Mesh(mesh.geometry, material));
    const geometryDisposed = vi.fn(); mesh.geometry.addEventListener("dispose", geometryDisposed);
    const materialDisposed = vi.fn(); material.addEventListener("dispose", materialDisposed);
    const textureDisposed = vi.fn(); texture.addEventListener("dispose", textureDisposed);
    const pending = create();
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await entered; controller.abort();
    // Late completion deliberately occurs after abort; must never be mounted.
    finish(gltf); await rejected;
    await Promise.resolve();
    expect(host.querySelectorAll("canvas")).toHaveLength(0);
    expect(geometryDisposed).toHaveBeenCalledTimes(1);
    expect(materialDisposed).toHaveBeenCalledTimes(1);
    expect(textureDisposed).toHaveBeenCalledTimes(1);
  });

  // Catches leaked canvas / GPU allocations and perpetual idle rendering.
  it("mounts one decorative canvas, renders once at rest and disposes resources exactly once", async () => {
    const mesh = gltf.scene.children[0].children[0] as Mesh;
    const geometryDisposed = vi.fn(); mesh.geometry.addEventListener("dispose", geometryDisposed);
    const materialDisposed = vi.fn(); (mesh.material as MeshStandardMaterial).addEventListener("dispose", materialDisposed);
    const handle = await create(); tick();
    expect(host.querySelectorAll("canvas")).toHaveLength(1);
    expect(host.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
    expect(host.querySelector("canvas")?.style.pointerEvents).toBe("none");
    expect(rendered().scene.getObjectByName("MG_Desk")).toBeDefined();
    expect(frames.size).toBe(0);
    handle.dispose(); handle.dispose();
    expect(host.querySelectorAll("canvas")).toHaveLength(0);
    expect(boundary.renderers[0].dispose).toHaveBeenCalledTimes(1);
    expect(geometryDisposed).toHaveBeenCalledTimes(1);
    expect(materialDisposed).toHaveBeenCalledTimes(1);
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
  });
});
