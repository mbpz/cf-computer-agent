export const LOCALE_STORAGE_KEY = "memory-garden-locale";
export const SUPPORTED_LOCALES = Object.freeze(["en", "zh-CN"] as const);
export type FrontendLocale = (typeof SUPPORTED_LOCALES)[number];

const catalogs: Record<FrontendLocale, Record<string, string>> = {
  en: {
    NAV_HOME: "Home",
    NAV_SUBMIT: "Submit",
    NAV_LIBRARY: "Library",
    NAV_SEARCH: "Search",
    NAV_AGENT: "Agent",
    NAV_MY_SUBMISSIONS: "My Submissions",
    NAV_ADMINISTRATION: "Administration",
  },
  "zh-CN": {
    NAV_HOME: "首页",
    NAV_SUBMIT: "提交",
    NAV_LIBRARY: "知识库",
    NAV_SEARCH: "搜索",
    NAV_AGENT: "智能问答",
    NAV_MY_SUBMISSIONS: "我的提交",
    NAV_ADMINISTRATION: "管理",
  },
};

interface LocaleStorage { getItem(key: string): string | null | undefined; setItem(key: string, value: string): void; }
interface LocaleOptions { navigatorLanguage?: string; storedLocale?: string | null; storage?: LocaleStorage; catalogs?: Partial<Record<FrontendLocale, Record<string, string>>>; }

export function createLocaleRuntime(options: LocaleOptions = {}) {
  const merged = {
    en: { ...catalogs.en, ...(options.catalogs?.en ?? {}) },
    "zh-CN": { ...catalogs["zh-CN"], ...(options.catalogs?.["zh-CN"] ?? {}) },
  } satisfies Record<FrontendLocale, Record<string, string>>;
  let persisted = options.storedLocale;
  if (persisted === undefined) {
    try { persisted = options.storage?.getItem(LOCALE_STORAGE_KEY); } catch { persisted = undefined; }
  }
  let locale: FrontendLocale = isLocale(persisted)
    ? persisted
    : options.navigatorLanguage?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
  const subscribers = new Set<(locale: FrontendLocale) => void>();
  return Object.freeze({
    get locale() { return locale; },
    t(key: string) { return merged[locale][key] ?? merged.en[key] ?? String(key); },
    setLocale(next: string) {
      if (!isLocale(next) || next === locale) return false;
      locale = next;
      try { options.storage?.setItem(LOCALE_STORAGE_KEY, next); } catch { /* optional storage */ }
      for (const subscriber of subscribers) subscriber(locale);
      return true;
    },
    subscribe(subscriber: (locale: FrontendLocale) => void) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
  });
}

function isLocale(value: unknown): value is FrontendLocale {
  return value === "en" || value === "zh-CN";
}
