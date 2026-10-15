// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyDocumentLanguage, createLocaleRuntime, documentLanguageForLocale, syncDocumentLanguage, type DocumentLanguageTarget } from "../../frontend/lib/i18n";

describe("frontend locale adapter", () => {
  it("selects Chinese from the browser language and allows explicit switching", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => { values.set(key, value); } };
    const runtime = createLocaleRuntime({ navigatorLanguage: "zh-Hans-CN", storage });
    expect(runtime.locale).toBe("zh-CN");
    expect(runtime.t("NAV_HOME")).toBe("首页");
    expect(runtime.setLocale("en")).toBe(true);
    expect(runtime.locale).toBe("en");
    expect(values.get("memory-garden-locale")).toBe("en");
  });

  it("falls back to English and never stores unsupported locales", () => {
    const storage = { getItem: () => "fr", setItem: () => undefined };
    const runtime = createLocaleRuntime({ navigatorLanguage: "fr-FR", storage });
    expect(runtime.locale).toBe("en");
    expect(runtime.setLocale("fr")).toBe(false);
    expect(runtime.t("UNKNOWN_KEY")).toBe("UNKNOWN_KEY");
  });

  it("does not expose raw navigation keys when a catalog entry is missing", () => {
    expect(createLocaleRuntime({ navigatorLanguage: "en" }).t("NAV_UNKNOWN")).toBe("Navigation");
    expect(createLocaleRuntime({ navigatorLanguage: "zh-CN" }).t("NAV_UNKNOWN")).toBe("导航");
  });

  it("translates coming-soon navigation and page copy in both catalogs", () => {
    expect(createLocaleRuntime({ navigatorLanguage: "en" }).t("NAV_COMING_SOON")).toBe("Coming soon");
    expect(createLocaleRuntime({ navigatorLanguage: "zh-CN" }).t("NAV_COMING_SOON")).toBe("建设中");
    expect(createLocaleRuntime({ navigatorLanguage: "en" }).t("PAGE_COMING_SOON_TITLE")).not.toBe("PAGE_COMING_SOON_TITLE");
    expect(createLocaleRuntime({ navigatorLanguage: "zh-CN" }).t("PAGE_COMING_SOON_TITLE")).not.toBe("PAGE_COMING_SOON_TITLE");
  });

  it("provides exact bilingual list and cursor-pager keys", () => {
    const english = createLocaleRuntime({ navigatorLanguage: "en" });
    const chinese = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    expect(english.t("LIST_LOADING_MORE")).toBe("Loading more");
    expect(chinese.t("LIST_LOADING_MORE")).toBe("正在加载更多");
    expect(english.t("LIST_END_OF_LIST")).toBe("No more items");
    expect(chinese.t("LIST_END_OF_LIST")).toBe("已加载全部");
    expect(english.t("COMMON_EXPAND")).toBe("Expand");
    expect(chinese.t("COMMON_EXPAND")).toBe("展开");
    expect(english.t("COMMON_COLLAPSE")).toBe("Collapse");
    expect(chinese.t("COMMON_COLLAPSE")).toBe("收起");
    expect(english.t("PAGINATION_NAVIGATION")).toBe("Pagination navigation");
    expect(chinese.t("PAGINATION_NAVIGATION")).toBe("分页导航");
    expect(english.t("PAGINATION_ROWS_PER_PAGE")).toBe("Rows per page");
    expect(chinese.t("PAGINATION_ROWS_PER_PAGE")).toBe("每页行数");
    expect(english.t("PAGINATION_PREVIOUS_PAGE")).toBe("Previous page");
    expect(chinese.t("PAGINATION_PREVIOUS_PAGE")).toBe("上一页");
    expect(english.t("PAGINATION_NEXT_PAGE")).toBe("Next page");
    expect(chinese.t("PAGINATION_NEXT_PAGE")).toBe("下一页");
    expect(english.t("PAGINATION_PAGE_LABEL")).toBe("Page {page}");
    expect(chinese.t("PAGINATION_PAGE_LABEL")).toBe("第 {page} 页");
  });

  it("maps the active locale to a document language and fails safe to English", () => {
    expect(documentLanguageForLocale("en")).toBe("en");
    expect(documentLanguageForLocale("zh-CN")).toBe("zh-CN");
    expect(documentLanguageForLocale("ZH-CN")).toBe("zh-CN");
    expect(documentLanguageForLocale("zh-cn")).toBe("zh-CN");
    expect(documentLanguageForLocale("fr")).toBe("en");
    expect(documentLanguageForLocale("")).toBe("en");
    expect(documentLanguageForLocale(null)).toBe("en");
    expect(documentLanguageForLocale(undefined)).toBe("en");
    expect(documentLanguageForLocale(42)).toBe("en");
    expect(documentLanguageForLocale({ locale: "zh-CN" })).toBe("en");
  });

  it("applies the document language and follows locale switches, defensively without document", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => { values.set(key, value); } };
    const documentElement = { lang: "en" };
    expect(applyDocumentLanguage("zh-CN", { documentElement })).toBe(true);
    expect(documentElement.lang).toBe("zh-CN");
    const runtime = createLocaleRuntime({ storedLocale: "zh-CN", storage });
    const unsubscribe = syncDocumentLanguage(runtime, { documentElement });
    expect(documentElement.lang).toBe("zh-CN");
    expect(runtime.setLocale("en")).toBe(true);
    expect(documentElement.lang).toBe("en");
    unsubscribe();
    expect(runtime.setLocale("zh-CN")).toBe(true);
    expect(documentElement.lang).toBe("en");

    expect("document" in globalThis).toBe(false);
    expect(applyDocumentLanguage("zh-CN")).toBe(false);
    expect(applyDocumentLanguage("zh-CN", null)).toBe(false);
    expect(() => syncDocumentLanguage(createLocaleRuntime({ navigatorLanguage: "zh-CN" }))).not.toThrow();
  });

  it("never lets a throwing document stub escape apply or break other locale subscribers", () => {
    const throwingDocument = { get documentElement(): { lang: string } { throw new Error("read"); } };
    const throwingLangRead = { documentElement: { get lang(): string { throw new Error("lang read"); } } };
    const throwingLangWrite = { documentElement: { get lang(): string { return "en"; }, set lang(_value: string) { throw new Error("lang write"); } } };
    expect(applyDocumentLanguage("zh-CN", throwingDocument as unknown as DocumentLanguageTarget)).toBe(false);
    expect(applyDocumentLanguage("zh-CN", throwingLangRead as unknown as DocumentLanguageTarget)).toBe(false);
    expect(applyDocumentLanguage("zh-CN", throwingLangWrite as unknown as DocumentLanguageTarget)).toBe(false);

    const seen: string[] = [];
    const runtime = createLocaleRuntime({ storedLocale: "zh-CN" });
    const other = runtime.subscribe((locale) => { seen.push(locale); });
    const stop = syncDocumentLanguage(runtime, throwingLangRead as unknown as DocumentLanguageTarget);
    expect(() => runtime.setLocale("en")).not.toThrow();
    expect(seen).toEqual(["en"]);
    expect(() => runtime.setLocale("zh-CN")).not.toThrow();
    expect(seen).toEqual(["en", "zh-CN"]);
    stop();
    other();
  });
});
