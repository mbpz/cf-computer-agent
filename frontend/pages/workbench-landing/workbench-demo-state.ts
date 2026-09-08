import { demoContent } from "./workbench-demo-data";

export type DemoStep = "overview" | "capture" | "library" | "answer" | "action" | "complete";
export type FeatureId = "capture" | "library" | "answer" | "action" | "updates";

export interface DemoState {
  step: DemoStep;
  activeFeature: FeatureId | null;
  citationId: string | null;
  captured: boolean;
  taskDone: boolean;
  paused: boolean;
}

export type DemoEvent =
  | { type: "start" } | { type: "capture" } | { type: "next" }
  | { type: "open"; feature: FeatureId } | { type: "close" }
  | { type: "citation"; id: string } | { type: "citation-back" }
  | { type: "complete-task" } | { type: "replay" }
  | { type: "pause"; value: boolean };

const nextStep = {
  overview: "capture", capture: "library", library: "answer", answer: "action", action: "complete",
} as const satisfies Record<Exclude<DemoStep, "complete">, DemoStep>;

export function initialDemoState(): DemoState {
  return {
    step: "overview", activeFeature: null, citationId: null,
    captured: false, taskDone: false, paused: false,
  };
}

export function demoReducer(state: DemoState, event: DemoEvent): DemoState {
  switch (event.type) {
    case "start":
    case "replay":
      return { ...initialDemoState(), step: "capture", activeFeature: "capture" };
    case "capture":
      return { ...state, captured: true };
    case "open":
      return { ...state, activeFeature: event.feature, citationId: null };
    case "close":
      return { ...state, activeFeature: null, citationId: null };
    case "citation":
      return demoContent("en").citations.some(citation => citation.id === event.id)
        ? { ...state, citationId: event.id } : state;
    case "citation-back":
      return { ...state, citationId: null };
    case "next": {
      if (state.step === "complete"
        || (state.step === "capture" && !state.captured)
        || (state.step === "action" && !state.taskDone)) return state;
      const step = nextStep[state.step];
      return { ...state, step, activeFeature: step === "complete" ? null : step, citationId: null };
    }
    case "complete-task":
      return state.step === "action" || state.activeFeature === "action"
        ? { ...state, taskDone: true } : state;
    case "pause":
      return { ...state, paused: event.value };
  }
}
