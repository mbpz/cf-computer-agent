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

export interface SceneSnapshot {
  feature: FeatureId | null; captured: boolean; taskDone: boolean;
  citationId: string | null; paused: boolean; reduceMotion: boolean; dark: boolean;
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
