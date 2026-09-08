// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { demoContent } from "../../frontend/pages/workbench-landing/workbench-demo-data";
import { landingText } from "../../frontend/pages/workbench-landing/workbench-copy";
import { demoReducer, initialDemoState, type DemoEvent, type DemoState } from "../../frontend/pages/workbench-landing/workbench-demo-state";

describe("public workbench demo reducer", () => {
  it("requires capture before guided progression", () => {
    let state = demoReducer(initialDemoState(), { type: "start" });
    expect(state.step).toBe("capture");
    expect(state.activeFeature).toBe("capture");
    expect(demoReducer(state, { type: "next" })).toEqual(state);
    state = demoReducer(state, { type: "capture" });
    expect(state.captured).toBe(true);
    expect(demoReducer(state, { type: "next" })).toEqual({
      step: "library", activeFeature: "library", citationId: null,
      captured: true, taskDone: false, paused: false,
    });
  });

  it("follows the full guided path and requires a manual task action before completion", () => {
    let state = initialDemoState();
    expect(state).toEqual({
      step: "overview", activeFeature: null, citationId: null,
      captured: false, taskDone: false, paused: false,
    });
    state = demoReducer(state, { type: "next" });
    expect(state).toMatchObject({ step: "capture", activeFeature: "capture" });
    state = demoReducer(state, { type: "capture" });
    for (const step of ["library", "answer", "action"] as const) {
      state = demoReducer(state, { type: "next" });
      expect(state).toMatchObject({ step, activeFeature: step, citationId: null });
    }
    expect(demoReducer(state, { type: "next" })).toEqual(state);
    state = demoReducer(state, { type: "complete-task" });
    expect(state.taskDone).toBe(true);
    state = demoReducer(state, { type: "next" });
    expect(state).toEqual({
      step: "complete", activeFeature: null, citationId: null,
      captured: true, taskDone: true, paused: false,
    });
    expect(demoReducer(state, { type: "next" })).toEqual(state);
  });

  it.each([
    { language: "en", description: /^This demo illustrates\b/, manualTask: /manually tracking a task/i },
    { language: "zh-CN", description: /^本演示展示/, manualTask: /手动跟进任务/ },
  ] as const)("describes the demo without claiming citation visits or inviting login after citation-free completion ($language)", ({ language, description, manualTask }) => {
    let state = initialDemoState();
    const events: DemoEvent[] = [
      { type: "start" }, { type: "capture" },
      { type: "next" }, { type: "next" }, { type: "next" },
      { type: "complete-task" }, { type: "next" },
    ];
    for (const event of events) {
      state = demoReducer(state, event);
      expect(state.citationId).toBeNull();
    }
    expect(state.step).toBe("complete");
    const locale = createLocaleRuntime({ storedLocale: language });
    const completion = landingText(locale, "COMPLETE_DESCRIPTION");
    expect(completion).toMatch(description);
    expect(completion).toMatch(manualTask);
    expect(completion).not.toMatch(/\byou\b|你(?:已|已经)/i);
    // Completion is also rendered when githubEnabled=false; login belongs to the separate CTA.
    expect(completion).not.toMatch(/log\s*in|sign\s*in|github|登录/i);
  });

  it("lets the last hotspot selection win without advancing the guide, and closes only the panel", () => {
    const before: DemoState = {
      step: "library", activeFeature: "library", citationId: "cite-filing",
      captured: true, taskDone: false, paused: true,
    };
    let state = before;
    for (const feature of ["capture", "library", "answer", "action", "updates"] as const) {
      state = demoReducer(state, { type: "open", feature });
      expect(state).toEqual({ ...before, activeFeature: feature, citationId: null });
      expect(demoReducer(state, { type: "open", feature })).toEqual(state);
    }
    state = demoReducer(state, { type: "close" });
    expect(state).toEqual({ ...before, activeFeature: null, citationId: null });
    expect(demoReducer(state, { type: "close" })).toEqual(state);
  });

  it("opens only known citations and returns to the same feature without changing progress", () => {
    const before: DemoState = {
      step: "answer", activeFeature: "answer", citationId: null,
      captured: true, taskDone: false, paused: true,
    };
    let state = before;
    for (const id of ["cite-filing", "cite-review"]) {
      state = demoReducer(state, { type: "citation", id });
      expect(state).toEqual({ ...before, citationId: id });
      expect(demoReducer(state, { type: "citation", id })).toEqual(state);
      for (const invalidId of ["", "missing", "p2", "filing-guide/p2", "CITE-FILING", "toString"]) {
        expect(demoReducer(state, { type: "citation", id: invalidId })).toEqual(state);
      }
    }
    expect(demoReducer(state, { type: "citation-back" })).toEqual(before);
    expect(demoReducer(before, { type: "citation-back" })).toEqual(before);
    expect(demoReducer(state, { type: "close" })).toEqual({ ...before, activeFeature: null });
    expect(demoReducer(state, { type: "next" })).toEqual({
      ...before, step: "action", activeFeature: "action", citationId: null,
    });
  });

  it("allows task completion only from the action step or the action hotspot", () => {
    for (const step of ["overview", "capture", "library", "answer", "action", "complete"] as const) {
      for (const activeFeature of [null, "capture", "library", "answer", "action", "updates"] as const) {
        const before: DemoState = {
          step, activeFeature, citationId: "cite-review", captured: false, taskDone: false, paused: true,
        };
        const state = demoReducer(before, { type: "complete-task" });
        expect(state).toEqual({ ...before, taskDone: step === "action" || activeFeature === "action" });
        expect(demoReducer(state, { type: "complete-task" })).toEqual(state);
      }
    }
  });

  it.each(["start", "replay"] as const)("%s resets all demo state and reopens capture", type => {
    const before: DemoState = {
      step: "complete", activeFeature: "updates", citationId: "cite-review",
      captured: true, taskDone: true, paused: true,
    };
    const state = demoReducer(before, { type });
    expect(state).toEqual({
      step: "capture", activeFeature: "capture", citationId: null,
      captured: false, taskDone: false, paused: false,
    });
    expect(demoReducer(state, { type })).toEqual(state);
    expect(initialDemoState()).toEqual({
      step: "overview", activeFeature: null, citationId: null,
      captured: false, taskDone: false, paused: false,
    });
  });

  it("pauses only animation state and still lets users progress manually", () => {
    const before: DemoState = {
      step: "answer", activeFeature: "answer", citationId: "cite-review",
      captured: true, taskDone: false, paused: false,
    };
    let state = demoReducer(before, { type: "pause", value: true });
    expect(state).toEqual({ ...before, paused: true });
    expect(demoReducer(state, { type: "pause", value: true })).toEqual(state);
    expect(demoReducer(state, { type: "pause", value: false })).toEqual(before);
    state = demoReducer(state, { type: "next" });
    expect(state).toEqual({ ...before, step: "action", activeFeature: "action", citationId: null, paused: true });
  });

  it("keeps progress, panel, citation, task and pause state when the existing runtime changes language", () => {
    const locale = createLocaleRuntime({ storedLocale: "en" });
    let state = demoReducer(initialDemoState(), { type: "start" });
    state = demoReducer(state, { type: "capture" });
    state = demoReducer(state, { type: "next" });
    state = demoReducer(state, { type: "next" });
    state = demoReducer(state, { type: "open", feature: "action" });
    state = demoReducer(state, { type: "complete-task" });
    state = demoReducer(state, { type: "open", feature: "answer" });
    state = demoReducer(state, { type: "citation", id: "cite-review" });
    state = demoReducer(state, { type: "pause", value: true });
    const before = { ...state };
    const englishAnswer = demoContent(locale.locale).answer;
    const englishHeading = landingText(locale, "ANSWER_TITLE");
    for (const language of ["zh-CN", "en"] as const) {
      expect(locale.setLocale(language)).toBe(true);
      const data = demoContent(locale.locale);
      const citation = data.citations.find(item => item.id === state.citationId)!;
      const paragraph = data.sources.find(source => source.id === citation.sourceId)
        ?.paragraphs.find(item => item.id === citation.paragraphId);
      expect(paragraph?.text.trim()).toBeTruthy();
      if (language === "zh-CN") {
        expect(data.answer).not.toBe(englishAnswer);
        expect(landingText(locale, "ANSWER_TITLE")).not.toBe(englishHeading);
      }
      expect(state).toEqual(before);
    }
    expect(demoReducer(state, { type: "next" })).toEqual({
      step: "action", activeFeature: "action", citationId: null,
      captured: true, taskDone: true, paused: true,
    });
  });

  it.each([
    { step: "overview", captured: false, taskDone: false, next: "capture" },
    { step: "capture", captured: false, taskDone: true, next: "capture" },
    { step: "capture", captured: true, taskDone: false, next: "library" },
    { step: "library", captured: false, taskDone: false, next: "answer" },
    { step: "answer", captured: false, taskDone: false, next: "action" },
    { step: "action", captured: true, taskDone: false, next: "action" },
    { step: "action", captured: false, taskDone: true, next: "complete" },
    { step: "complete", captured: true, taskDone: true, next: "complete" },
  ] as const)("advances $step with captured=$captured and taskDone=$taskDone to $next", row => {
    const before: DemoState = {
      step: row.step, captured: row.captured, taskDone: row.taskDone,
      activeFeature: "updates", citationId: "cite-filing", paused: true,
    };
    const state = demoReducer(before, { type: "next" });
    if (row.step === row.next) {
      expect(state).toEqual(before);
    } else {
      expect(state).toEqual({
        ...before, step: row.next, activeFeature: row.next === "complete" ? null : row.next, citationId: null,
      });
    }
  });

  it("capture changes only the local captured flag and repeated capture is idempotent", () => {
    const before: DemoState = {
      step: "overview", activeFeature: "updates", citationId: "cite-filing",
      captured: false, taskDone: true, paused: true,
    };
    const state = demoReducer(before, { type: "capture" });
    expect(state).toEqual({ ...before, captured: true });
    expect(demoReducer(state, { type: "capture" })).toEqual(state);
  });

  it("is deterministic for every event and never mutates input state or events", () => {
    const events: readonly DemoEvent[] = [
      { type: "start" }, { type: "capture" }, { type: "next" },
      { type: "open", feature: "updates" }, { type: "close" },
      { type: "citation", id: "cite-filing" }, { type: "citation", id: "invalid" },
      { type: "citation-back" }, { type: "complete-task" }, { type: "replay" },
      { type: "pause", value: true }, { type: "pause", value: false },
    ];
    for (const step of ["overview", "capture", "library", "answer", "action", "complete"] as const) {
      const before: DemoState = {
        step, activeFeature: "action", citationId: "cite-review", captured: true, taskDone: true, paused: true,
      };
      for (const event of events) {
        const state = Object.freeze({ ...before });
        const frozenEvent = Object.freeze({ ...event });
        expect(demoReducer(state, frozenEvent)).toEqual(demoReducer(state, frozenEvent));
        expect(state).toEqual(before);
        expect(frozenEvent).toEqual(event);
      }
    }
    expect(initialDemoState()).not.toBe(initialDemoState());
  });
});
