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
    APP_BRAND_EYEBROW: "PRIVATE KNOWLEDGE WORKSPACE",
    SHELL_SKIP_MAIN: "Skip to main content",
    SHELL_WORKSPACE_NAVIGATION: "Workspace navigation",
    SHELL_PRIMARY_NAVIGATION: "Primary navigation",
    SHELL_OPEN_NAVIGATION: "Open navigation",
    SHELL_CLOSE_NAVIGATION: "Close navigation",
    SHELL_LOGOUT: "Log out",
    SHELL_LANGUAGE_LABEL: "Language",
    SHELL_LANGUAGE_EN: "English",
    SHELL_LANGUAGE_ZH_CN: "简体中文",
    SHELL_GROUP_WORKSPACE: "Workspace",
    SHELL_GROUP_ADMIN: "Governance",
    SHELL_CONTEXT_TITLE: "At a glance",
    COMMON_VALUE_UNAVAILABLE: "Not provided",
    PAGE_FORBIDDEN_TITLE: "403: Access denied",
    PAGE_FORBIDDEN_DESCRIPTION: "This route requires a capability that is not present in the server-issued session.",
  },
  "zh-CN": {
    NAV_HOME: "首页",
    NAV_SUBMIT: "提交",
    NAV_LIBRARY: "知识库",
    NAV_SEARCH: "搜索",
    NAV_AGENT: "智能问答",
    NAV_MY_SUBMISSIONS: "我的提交",
    NAV_ADMINISTRATION: "管理",
    APP_BRAND_EYEBROW: "私人知识工作区",
    SHELL_SKIP_MAIN: "跳到主要内容",
    SHELL_WORKSPACE_NAVIGATION: "工作区导航",
    SHELL_PRIMARY_NAVIGATION: "主要导航",
    SHELL_OPEN_NAVIGATION: "打开导航",
    SHELL_CLOSE_NAVIGATION: "关闭导航",
    SHELL_LOGOUT: "退出工作区",
    SHELL_LANGUAGE_LABEL: "语言",
    SHELL_LANGUAGE_EN: "English",
    SHELL_LANGUAGE_ZH_CN: "简体中文",
    SHELL_GROUP_WORKSPACE: "工作区",
    SHELL_GROUP_ADMIN: "治理",
    SHELL_CONTEXT_TITLE: "快速概览",
    COMMON_VALUE_UNAVAILABLE: "未提供",
    PAGE_FORBIDDEN_TITLE: "403：访问被拒绝",
    PAGE_FORBIDDEN_DESCRIPTION: "当前服务器会话没有访问此路由所需的能力。",
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
