// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

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

  it("provides exact bilingual pagination keys and placeholders", () => {
    const english = createLocaleRuntime({ navigatorLanguage: "en" });
    const chinese = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    expect(english.t("PAGINATION_NAVIGATION")).toBe("Pagination navigation");
    expect(chinese.t("PAGINATION_NAVIGATION")).toBe("分页导航");
    expect(english.t("PAGINATION_TOTAL")).toBe("Total");
    expect(chinese.t("PAGINATION_TOTAL")).toBe("总计");
    expect(english.t("PAGINATION_VISIBLE")).toBe("Visible");
    expect(chinese.t("PAGINATION_VISIBLE")).toBe("当前显示");
    expect(english.t("PAGINATION_ROWS_PER_PAGE")).toBe("Rows per page");
    expect(chinese.t("PAGINATION_ROWS_PER_PAGE")).toBe("每页行数");
    expect(english.t("PAGINATION_PREVIOUS_PAGE")).toBe("Previous page");
    expect(chinese.t("PAGINATION_PREVIOUS_PAGE")).toBe("上一页");
    expect(english.t("PAGINATION_NEXT_PAGE")).toBe("Next page");
    expect(chinese.t("PAGINATION_NEXT_PAGE")).toBe("下一页");
    expect(english.t("PAGINATION_PAGE_LABEL")).toBe("Page {page}");
    expect(chinese.t("PAGINATION_PAGE_LABEL")).toBe("第 {page} 页");
    expect(english.t("PAGINATION_MOBILE_SUMMARY")).toBe("{page} / {totalPages}");
    expect(chinese.t("PAGINATION_MOBILE_SUMMARY")).toBe("{page} / {totalPages}");
  });
});
