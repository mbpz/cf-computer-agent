import {
  Box3, Color, DirectionalLight, HemisphereLight, OrthographicCamera,
  Quaternion, Scene, Vector3, WebGLRenderer,
} from "three";
import type { BufferGeometry, Material, Mesh, Object3D, Texture } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ANIMATION_NODES, FEATURE_NODES, REQUIRED_ROOTS, SCENE_BUDGET, SCENE_VIEWS, type SceneOptions, type SceneSnapshot, type SceneViewId, type WorkbenchSceneHandle } from "./workbench-scene-config";

/**
 * Unit vector from the framed centre towards the camera for one authored view.
 * Direction only: `fit()` owns the framing, so a view change never rescales the
 * model, it orbits it.
 */
function viewDirection(view: SceneViewId): Vector3 {
  const entry = SCENE_VIEWS.find(candidate => candidate.id === view) ?? SCENE_VIEWS[0];
  return new Vector3(Math.sin(entry.azimuth) * Math.cos(entry.elevation), Math.sin(entry.elevation), Math.cos(entry.azimuth) * Math.cos(entry.elevation)).normalize();
}

type LocalPose = Pick<Object3D, "position" | "quaternion" | "scale">;
function copyPose(source: LocalPose): LocalPose {
  return { position: source.position.clone(), quaternion: source.quaternion.clone(), scale: source.scale.clone() };
}
function applyPose(node: Object3D, pose: LocalPose): void {
  node.position.copy(pose.position); node.quaternion.copy(pose.quaternion); node.scale.copy(pose.scale);
}

function disposeObjects(roots: readonly Object3D[]): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  for (const root of roots) root.traverse(object => {
    const mesh = object as Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value && typeof value === "object" && "isTexture" in value && value.isTexture) textures.add(value as Texture);
      }
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  const images = new Set<{ close(): void }>();
  textures.forEach(texture => {
    const image: unknown = texture.source.data;
    if (image && typeof image === "object" && "close" in image && typeof image.close === "function") images.add(image as { close(): void });
    texture.dispose();
  });
  images.forEach(image => image.close());
}

async function loadModel(options: SceneOptions): Promise<GLTF> {
  options.signal.throwIfAborted();
  let onAbort!: () => void;
  let loaded: GLTF | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(options.signal.reason ?? new DOMException("Aborted", "AbortError"));
  });
  options.signal.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await Promise.race([fetch(options.modelUrl, { signal: options.signal }), aborted]);
    options.signal.throwIfAborted();
    if (!response.ok) throw new Error(`MODEL_HTTP_${response.status}`);
    const bytes = await Promise.race([response.arrayBuffer(), aborted]);
    options.signal.throwIfAborted();
    const parsed = new GLTFLoader().parseAsync(bytes, new URL(".", new URL(options.modelUrl, options.host.ownerDocument.baseURI)).href)
      .then(gltf => {
        // Parsing is not abortable. Retain this continuation even after the race rejects.
        if (options.signal.aborted) { disposeObjects(gltf.scenes); options.signal.throwIfAborted(); }
        loaded = gltf;
        return gltf;
      });
    const gltf = await Promise.race([parsed, aborted]);
    options.signal.throwIfAborted();
    return gltf;
  } finally {
    options.signal.removeEventListener("abort", onAbort);
    if (options.signal.aborted && loaded) disposeObjects(loaded.scenes);
  }
}

export async function createWorkbenchScene(options: SceneOptions): Promise<WorkbenchSceneHandle> {
  const gltf = await loadModel(options);
  let renderer: WebGLRenderer | undefined;
  let controls: OrbitControls | undefined;
  let observer: ResizeObserver | undefined;
  let disposed = false;
  let renderedFrames = 0;
  const metricNames = ["draw-calls", "triangles", "frames", "geometries", "textures", "dpr"] as const;
  let frame: number | undefined;
  let removeVisibilityListener = () => {};
  function cancelFrame() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelFrame();
    options.signal.removeEventListener("abort", dispose);
    removeVisibilityListener();
    renderer?.domElement.removeEventListener("webglcontextlost", contextLost);
    observer?.disconnect(); disposeObjects(gltf.scenes);
    controls?.dispose();
    renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove();
    if (import.meta.env.DEV) for (const name of metricNames) options.host.removeAttribute(`data-scene-${name}`);
  }
  function fail(reason: "context-lost" | "render-error") {
    if (disposed) return;
    dispose(); options.onFailure(reason);
  }
  function contextLost(event: Event) {
    event.preventDefault(); fail("context-lost");
  }
  try {
    options.signal.throwIfAborted();
    gltf.scene.updateMatrixWorld(true);
    for (const name of [...REQUIRED_ROOTS, ...Object.values(ANIMATION_NODES)]) {
      const nodes: Object3D[] = [];
      gltf.scene.traverse(node => { if (node.name === name) nodes.push(node); });
      if (nodes.length !== 1) throw new Error(`MODEL_INVALID_NODE_${name}`);
      const nodeBounds = new Box3().setFromObject(nodes[0]);
      if (nodeBounds.isEmpty() || ![...nodeBounds.min.toArray(), ...nodeBounds.max.toArray()].every(Number.isFinite)) throw new Error(`MODEL_INVALID_BOUNDS_${name}`);
    }
    renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
    const scene = new Scene();
    scene.add(gltf.scene, new HemisphereLight(0xffffff, 0x6c746f, 2));
    const key = new DirectionalLight(0xffffff, 3); key.position.set(5, 10, 7); scene.add(key);
    scene.background = new Color(0xf4f3ed);
    const bounds = new Box3().setFromObject(gltf.scene);
    if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) throw new Error("MODEL_INVALID_BOUNDS");
    const center = bounds.getCenter(new Vector3());
    const size = Math.max(bounds.getSize(new Vector3()).length(), 0.01);
    const camera = new OrthographicCamera(-size, size, size, -size, size / 1000, size * 10);
    const cameraDistance = size * 3;
    const direction = viewDirection(SCENE_VIEWS[0].id);
    camera.position.copy(center).addScaledVector(direction, cameraDistance); camera.lookAt(center); camera.updateMatrixWorld(true);
    const canvas = renderer.domElement;
    canvas.addEventListener("webglcontextlost", contextLost);
    canvas.setAttribute("aria-hidden", "true"); canvas.style.pointerEvents = "auto";
    options.signal.throwIfAborted();
    options.host.append(canvas);
    // Pointer orbit is optional for the visitor: the tour keeps moving on its own,
    // and a drag simply takes over from where the tour left the camera.
    controls = new OrbitControls(camera, canvas);
    controls.target.copy(center);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minPolarAngle = 0.55; controls.maxPolarAngle = 1.45;
    controls.minZoom = 0.6; controls.maxZoom = 2.4;
    let lastControlChange = 0;
    let drawing = false;
    controls.addEventListener("change", () => {
      lastControlChange = performance.now();
      if (disposed) return;
      // A paused page still renders what the visitor does with the pointer: draw
      // synchronously (re-entrancy guarded) instead of waiting for an animation
      // frame the tour would never schedule while paused.
      draw();
      if (snapshot.paused) return;
      cancelFrame(); frame = requestAnimationFrame(animate);
    });
    canvas.style.width = "100%"; canvas.style.height = "100%"; canvas.style.display = "block";
    let snapshot: SceneSnapshot = { feature: null, captured: false, taskDone: false, citationId: null, paused: false, reduceMotion: false, dark: false };
    let visible = true;
    let width = 0, height = 0, aspect = 1;
    let halfHeight = size;
    let transition: { from: Vector3; fromHeight: number; fromDirection: Vector3; started: number } | undefined;
    const actors = {
      capture: gltf.scene.getObjectByName(ANIMATION_NODES.capture)!,
      task: gltf.scene.getObjectByName(ANIMATION_NODES.task)!,
      citation: gltf.scene.getObjectByName(ANIMATION_NODES.citation)!,
      assistant: gltf.scene.getObjectByName("MG_Assistant")!,
    };
    let assistantTurned = false;
    const origins = new Map(Object.values(actors).map(node => [node, copyPose(node)]));
    const motions = new Map<Object3D, { from: LocalPose; to: LocalPose; started: number }>();
    function targetPose(role: keyof typeof actors) {
      const pose = copyPose(origins.get(actors[role])!);
      // Authored GLB is Y-up. These are parent-local offsets, never world coordinates.
      if (role === "capture" && snapshot.captured) pose.position.y -= 0.14;
      if (role === "task" && snapshot.taskDone) pose.position.x += 1.195;
      if (role === "citation" && snapshot.citationId !== null) { pose.position.y += 0.06; pose.scale.multiplyScalar(1.12); }
      if (role === "assistant" && assistantTurned) pose.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.24));
      return pose;
    }
    function settlePoses() {
      motions.clear();
      for (const role of Object.keys(actors) as (keyof typeof actors)[]) applyPose(actors[role], targetPose(role));
    }
    function canDraw() { return visible && !options.host.ownerDocument.hidden && width > 0 && height > 0; }
    const materialColors = new Map<Material & { color: Color }, Color>();
    gltf.scene.traverse(object => {
      const material = (object as Mesh).material;
      for (const entry of material ? (Array.isArray(material) ? material : [material]) : []) {
        if ("color" in entry && entry.color instanceof Color) materialColors.set(entry as Material & { color: Color }, entry.color.clone());
      }
    });
    function applyTheme() {
      (scene.background as Color).set(snapshot.dark ? 0x181f22 : 0xf4f3ed);
      for (const [material, original] of materialColors) {
        material.color.copy(original);
        if (snapshot.dark) material.color.multiplyScalar(0.82);
      }
    }

    function fit() {
      gltf.scene.updateMatrixWorld(true);
      const targetBounds = new Box3().setFromObject(snapshot.feature
        ? gltf.scene.getObjectByName(FEATURE_NODES[snapshot.feature])! : gltf.scene);
      const target = targetBounds.getCenter(new Vector3());
      const inverse = camera.quaternion.clone().invert();
      let extentX = 0, extentY = 0;
      for (const x of [targetBounds.min.x, targetBounds.max.x]) for (const y of [targetBounds.min.y, targetBounds.max.y]) for (const z of [targetBounds.min.z, targetBounds.max.z]) {
        const point = new Vector3(x, y, z).sub(target).applyQuaternion(inverse);
        extentX = Math.max(extentX, Math.abs(point.x)); extentY = Math.max(extentY, Math.abs(point.y));
      }
      return { target, height: Math.max(extentY, extentX / aspect, size / 20) * 1.16 };
    }
    /** Frame the current target at the current scale; the orbit stays where the visitor left it. */
    function applyCamera() {
      const delta = center.clone().sub(controls!.target);
      camera.position.add(delta); controls!.target.copy(center);
      camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
      camera.top = halfHeight; camera.bottom = -halfHeight;
      camera.updateProjectionMatrix(); controls!.update(); camera.updateMatrixWorld(true);
    }
    /** Face the tour's authored angle around the target, keeping the visitor's distance. */
    function placeCamera() {
      const distance = Math.max(camera.position.distanceTo(controls!.target), cameraDistance);
      camera.position.copy(controls!.target).addScaledVector(direction, distance);
      camera.lookAt(controls!.target);
      controls!.update();
    }
    function draw() {
      if (disposed || !canDraw() || drawing) return;
      drawing = true;
      try {
        applyCamera(); renderer!.render(scene, camera);
        if (disposed) return;
        if (import.meta.env.DEV) {
          const info = renderer!.info;
          const values = [info.render.calls, info.render.triangles, ++renderedFrames, info.memory.geometries, info.memory.textures, renderer!.getPixelRatio()];
          metricNames.forEach((name, i) => options.host.setAttribute(`data-scene-${name}`, String(values[i])));
        }
      } catch { fail("render-error"); } finally { drawing = false; }
    }
    function snap(resetCycle = false) {
      cancelFrame(); transition = undefined;
      direction.copy(viewDirection(snapshot.view ?? SCENE_VIEWS[0].id));
      if (resetCycle) {
        motions.clear();
        for (const [node, origin] of origins) applyPose(node, origin);
      } else settlePoses();
      const target = fit(); center.copy(target.target); halfHeight = target.height;
      controls!.target.copy(center); placeCamera();
      draw();
    }
    function animate(timestamp: number) {
      frame = undefined;
      if (disposed || !canDraw() || snapshot.paused || (!transition && !motions.size)) return;
      for (const [node, motion] of motions) {
        const progress = Math.min(1, Math.max(0, (timestamp - motion.started) / SCENE_BUDGET.transitionMs));
        const eased = progress * progress * (3 - 2 * progress);
        node.position.lerpVectors(motion.from.position, motion.to.position, eased);
        node.scale.lerpVectors(motion.from.scale, motion.to.scale, eased);
        node.quaternion.slerpQuaternions(motion.from.quaternion, motion.to.quaternion, eased);
        if (progress === 1) { applyPose(node, motion.to); motions.delete(node); }
      }
      if (transition) {
        const progress = Math.min(1, Math.max(0, (timestamp - transition.started) / SCENE_BUDGET.transitionMs));
        const eased = progress * progress * (3 - 2 * progress);
        // Refit after applying descendant poses, not against their pre-animation bounds.
        const target = fit();
        center.lerpVectors(transition.from, target.target, eased);
        direction.lerpVectors(transition.fromDirection, viewDirection(snapshot.view ?? SCENE_VIEWS[0].id), eased).normalize();
        halfHeight = transition.fromHeight + (target.height - transition.fromHeight) * eased;
        controls!.target.copy(center); placeCamera();
        if (progress === 1) transition = undefined;
      }
      draw();
      if ((transition || motions.size || performance.now() - lastControlChange < 600) && !disposed) frame = requestAnimationFrame(animate);
    }
    function resize() {
      if (disposed) return;
      const rect = options.host.getBoundingClientRect();
      width = Math.max(0, rect.width); height = Math.max(0, rect.height);
      if (width === 0 || height === 0) { cancelFrame(); return; }
      aspect = width / height;
      const mobile = window.innerWidth < 768 || window.matchMedia?.("(pointer: coarse)").matches;
      const rawDpr = window.devicePixelRatio;
      renderer!.setPixelRatio(Math.min(Number.isFinite(rawDpr) && rawDpr > 0 ? rawDpr : 1, mobile ? SCENE_BUDGET.mobileDpr : SCENE_BUDGET.desktopDpr));
      renderer!.setSize(width, height, false);
      snap();
    }
    observer = new ResizeObserver(() => {
      try { resize(); } catch { fail("render-error"); }
    });
    observer.observe(options.host);
    resize();
    if (disposed) throw new Error("SCENE_INITIALIZATION_FAILED");
    function visibilityChanged() {
      if (disposed) return;
      if (!canDraw()) cancelFrame(); else snap();
    }
    options.host.ownerDocument.addEventListener("visibilitychange", visibilityChanged);
    removeVisibilityListener = () => options.host.ownerDocument.removeEventListener("visibilitychange", visibilityChanged);
    options.signal.addEventListener("abort", dispose, { once: true });
    if (options.signal.aborted) { dispose(); options.signal.throwIfAborted(); }
    return {
      update(next: SceneSnapshot) {
        if (disposed) return;
        const changedCycle = (next.cycleId ?? 0) !== (snapshot.cycleId ?? 0);
        if (!changedCycle && (Object.keys(snapshot) as (keyof SceneSnapshot)[]).every(key => key === "cycleId" || snapshot[key] === next[key])) return;
        const changedFeature = next.feature !== snapshot.feature;
        const changedCapture = next.captured !== snapshot.captured;
        const changedTask = next.taskDone !== snapshot.taskDone;
        const changedCitation = (next.citationId !== null) !== (snapshot.citationId !== null);
        const changedView = (next.view ?? SCENE_VIEWS[0].id) !== (snapshot.view ?? SCENE_VIEWS[0].id);
        snapshot = { ...next };
        if (import.meta.env.DEV) {
          options.host.setAttribute("data-scene-view", snapshot.view ?? SCENE_VIEWS[0].id);
          options.host.setAttribute("data-scene-azimuth", (Math.atan2(camera.position.x - controls!.target.x, camera.position.z - controls!.target.z) * 180 / Math.PI).toFixed(1));
        }
        applyTheme();
        if (changedCycle) { assistantTurned = false; snap(true); return; }
        // One short acknowledgement per demo/replay cycle, never an idle loop.
        const changedAssistant = !assistantTurned && (snapshot.feature !== null || snapshot.captured || snapshot.taskDone || snapshot.citationId !== null);
        if (changedAssistant) assistantTurned = true;
        for (const [role, changed] of [["capture", changedCapture], ["task", changedTask], ["citation", changedCitation], ["assistant", changedAssistant]] as const) {
          const node = actors[role];
          if (changed) motions.set(node, { from: copyPose(node), to: targetPose(role), started: performance.now() });
        }
        if (!canDraw() || snapshot.paused || snapshot.reduceMotion) { snap(); return; }
        if (changedFeature || changedCapture || changedTask || changedCitation || changedAssistant || changedView) {
          transition = { from: center.clone(), fromHeight: halfHeight, fromDirection: direction.clone(), started: performance.now() };
        }
        if (transition || motions.size) { cancelFrame(); frame = requestAnimationFrame(animate); }
        else draw();
      },
      setVisible(value: boolean) {
        if (disposed || visible === value) return;
        visible = value;
        if (!visible) cancelFrame(); else snap();
      },
      dispose,
    };
  } catch (error) {
    dispose(); throw error;
  }
}
