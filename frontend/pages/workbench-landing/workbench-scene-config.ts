import type { FeatureId } from "./workbench-demo-state";

export const LANDING_MODEL_URL = new URL("../../assets/workbench-landing/workbench.glb", import.meta.url).href;
export const LANDING_POSTER_DESKTOP_URL = new URL("../../assets/workbench-landing/poster-desktop.webp", import.meta.url).href;
export const LANDING_POSTER_MOBILE_URL = new URL("../../assets/workbench-landing/poster-mobile.webp", import.meta.url).href;

export const REQUIRED_ROOTS = [
  "MG_Desk", "MG_Inbox", "MG_Library", "MG_Query", "MG_Board", "MG_Updates", "MG_Assistant",
] as const;
export const FEATURE_NODES = {
  capture: "MG_Inbox", library: "MG_Library", answer: "MG_Query", action: "MG_Board", updates: "MG_Updates",
} as const satisfies Record<FeatureId, (typeof REQUIRED_ROOTS)[number]>;
export const ANIMATION_NODES = {
  capture: "MG_CaptureCard", citation: "MG_CitationCard", task: "MG_TaskCard",
} as const;
export const SCENE_BUDGET = {
  modelBytes: 2 * 1024 * 1024, posterBytes: 250 * 1024, runtimeGzipBytes: 250 * 1024,
  triangles: 60_000, drawCalls: 80, textureSize: 1024,
  desktopDpr: 1.5, mobileDpr: 1, loadTimeoutMs: 8000, transitionMs: 380,
} as const;

/**
 * Authored viewing angles the automatic tour orbits through, in radians around
 * the model's up axis. The camera always looks at the framed feature, so a view
 * changes only the direction the workbench is seen from — the whole animation
 * can be watched instead of one fixed angle.
 */
export const SCENE_VIEWS = [
  { id: "front", azimuth: 0.79, elevation: 0.55 },
  { id: "left", azimuth: -0.55, elevation: 0.42 },
  { id: "right", azimuth: 2.12, elevation: 0.5 },
  { id: "high", azimuth: 0.4, elevation: 0.95 },
  { id: "low", azimuth: -0.2, elevation: 0.18 },
] as const;
export type SceneViewId = (typeof SCENE_VIEWS)[number]["id"];
/** How long one viewing angle stays before the tour moves on. */
export const SCENE_TOUR_INTERVAL_MS = 6000;

export interface SceneSnapshot {
  /** Page-owned start/replay epoch. Omitted means cycle 0; feature changes never reset a cycle. */
  cycleId?: number;
  feature: FeatureId | null; captured: boolean; taskDone: boolean;
  citationId: string | null; paused: boolean; reduceMotion: boolean; dark: boolean;
  /** Viewing angle the tour is on. Omitted means the first authored view. */
  view?: SceneViewId;
}
export interface WorkbenchSceneHandle {
  update(snapshot: SceneSnapshot): void;
  setVisible(value: boolean): void;
  dispose(): void;
}
export interface SceneOptions {
  host: HTMLElement; modelUrl: string; signal: AbortSignal;
  onFailure(reason: "context-lost" | "render-error"): void;
}
