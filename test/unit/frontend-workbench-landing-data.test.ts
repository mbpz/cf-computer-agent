// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { demoContent } from "../../frontend/pages/workbench-landing/workbench-demo-data";
import { LANDING_COPY_KEYS, landingText, type LandingCopyKey } from "../../frontend/pages/workbench-landing/workbench-copy";

describe("public workbench demo content", () => {
  it("keeps source citations resolvable with stable IDs in both languages", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const data = demoContent(locale);
      expect(data.sources.map(source => [source.id, source.paragraphs.map(p => p.id)])).toEqual([
        ["filing-guide", ["p1", "p2", "p3"]],
        ["weekly-review", ["p1", "p2", "p3"]],
      ]);
      expect(data.citations).toEqual([
        { id: "cite-filing", sourceId: "filing-guide", paragraphId: "p2" },
        { id: "cite-review", sourceId: "weekly-review", paragraphId: "p2" },
      ]);
      for (const citation of data.citations) {
        const paragraph = data.sources.find(source => source.id === citation.sourceId)
          ?.paragraphs.find(p => p.id === citation.paragraphId);
        expect(paragraph?.text.trim()).toBeTruthy();
      }
    }
  });

  it("localizes every sample paragraph and keeps notifications and discussion on the sample task", () => {
    const en = demoContent("en");
    const zh = demoContent("zh-CN");
    expect(en.sources.map(source => source.title)).toEqual(["Project filing guide", "Weekly review method"]);
    expect(zh.sources.map(source => source.title)).toEqual(["项目资料整理约定", "每周回顾方法"]);
    expect(zh.question).toBe("如何把零散的项目资料变成下一步行动？");
    expect(zh.taskTitle).toBe("整理本周项目资料");
    for (const data of [en, zh]) {
      for (const text of [data.question, data.answer, data.taskTitle, data.notification, data.discussion]) {
        expect(text.trim()).not.toBe("");
      }
      expect(data.notification).toContain(data.taskTitle);
      expect(data.discussion).toContain(data.taskTitle);
    }
    for (const source of en.sources) {
      const translated = zh.sources.find(item => item.id === source.id)!;
      for (const paragraph of source.paragraphs) {
        expect(paragraph.text.trim()).not.toBe("");
        expect(paragraph.text).not.toMatch(/\p{Script=Han}/u);
        const translatedParagraph = translated.paragraphs.find(item => item.id === paragraph.id)!;
        expect(translatedParagraph.text).toMatch(/\p{Script=Han}/u);
        expect(translatedParagraph.text).not.toBe(paragraph.text);
      }
    }
    expect(demoContent("en")).toEqual(en);
    expect(demoContent("zh-CN")).toEqual(zh);
  });

  it("reads the current LocaleRuntime without extending its global catalog", () => {
    const locale = createLocaleRuntime({ storedLocale: "en" });
    const shape = Object.keys(locale);
    const originalLookup = locale.t("HERO_TITLE");
    expect(landingText(locale, "HERO_TITLE")).toBe("Turn your knowledge into everyday action.");
    expect(locale.setLocale("zh-CN")).toBe(true);
    expect(landingText(locale, "HERO_TITLE")).toBe("让你的知识，成为每天的行动力。");
    expect(landingText(locale, "DEMO_BADGE")).toBe("示例演示 · 不读取你的个人数据");
    expect(locale.setLocale("en")).toBe(true);
    expect(landingText(locale, "DEMO_BADGE")).toBe("Example demo · Does not read your personal data");
    expect(locale.t("HERO_TITLE")).toBe(originalLookup);
    expect(Object.keys(locale)).toEqual(shape);
  });

  it("provides translated copy for every approved page, panel and scene control", () => {
    const requiredKeys = [
      "BRAND", "HERO_TITLE", "HERO_DESCRIPTION", "START", "EXPLORE", "LOGIN", "INVITE_ONLY",
      "DEMO_BADGE", "DEMO_DESCRIPTION", "FLOW_TITLE", "FLOW_DESCRIPTION", "PRIVACY_TITLE", "PRIVACY_DESCRIPTION", "FOOTER_CTA",
      "GUIDE_LABEL", "GUIDE_HINT", "NEXT", "REPLAY", "CLOSE_PANEL", "BACK_TO_ANSWER", "OPEN_SOURCE",
      "SOURCE_LABEL", "PARAGRAPH_LABEL", "CITATIONS_LABEL", "QUESTION_LABEL", "ANSWER_LABEL", "HOTSPOTS_LABEL",
      "STEP_OVERVIEW", "STEP_CAPTURE", "STEP_LIBRARY", "STEP_ANSWER", "STEP_ACTION", "STEP_COMPLETE",
      "CAPTURE_TITLE", "CAPTURE_DESCRIPTION", "CAPTURE_SELECT", "CAPTURE_PENDING", "CAPTURE_DONE", "CAPTURE_GATE",
      "LIBRARY_TITLE", "LIBRARY_DESCRIPTION", "LIBRARY_SUMMARY", "LIBRARY_REVIEW", "LIBRARY_PUBLISHED",
      "ANSWER_TITLE", "ANSWER_DESCRIPTION", "ANSWER_SHOW", "ANSWER_CITATION_HINT",
      "ACTION_TITLE", "ACTION_DESCRIPTION", "ACTION_COMPLETE", "ACTION_TODO", "ACTION_DONE", "ACTION_GATE", "TASK_LABEL", "BOARD_LABEL",
      "UPDATES_TITLE", "UPDATES_DESCRIPTION", "UPDATES_NOTIFICATION", "UPDATES_DISCUSSION", "COMPLETE_TITLE", "COMPLETE_DESCRIPTION",
      "SCENE_LABEL", "SCENE_POSTER_ALT", "SCENE_IDLE", "SCENE_LOADING", "SCENE_READY", "SCENE_STATIC",
      "SCENE_REDUCED_MOTION", "SCENE_SAVE_DATA", "SCENE_ERROR", "SCENE_UNAVAILABLE", "SCENE_TIMEOUT",
      "SCENE_CONTEXT_LOST", "SCENE_MISSING_NODES", "SCENE_LOAD", "SCENE_RETRY", "SCENE_STATIC_MODE",
      "SCENE_PAUSE", "SCENE_RESUME", "SCENE_PAUSED", "SWITCH_LANGUAGE", "SWITCH_THEME",
    ] as const satisfies readonly LandingCopyKey[];
    expect(LANDING_COPY_KEYS).toEqual(expect.arrayContaining([...requiredKeys]));
    expect(new Set(LANDING_COPY_KEYS).size).toBe(LANDING_COPY_KEYS.length);
    const en = createLocaleRuntime({ storedLocale: "en" });
    const zh = createLocaleRuntime({ storedLocale: "zh-CN" });
    // Enumerate the entire exported catalog, including any future additions.
    for (const key of LANDING_COPY_KEYS) {
      const english = landingText(en, key);
      const chinese = landingText(zh, key);
      for (const text of [english, chinese]) {
        expect(typeof text).toBe("string");
        expect(text.trim()).not.toBe("");
        expect([key, "undefined", "null"]).not.toContain(text);
      }
      if (key !== "BRAND") {
        expect(chinese).not.toBe(english);
        expect(chinese).toMatch(/\p{Script=Han}/u);
        expect(english).not.toMatch(/\p{Script=Han}/u);
      }
    }
  });
});
