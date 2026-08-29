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
});
