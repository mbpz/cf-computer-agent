export type Locale = "en" | "zh-CN";
export type TranslationValues = Readonly<Record<string, string | number>>;
export interface I18n {
  readonly locale: Locale;
  t(key: string, values?: TranslationValues): string;
  setLocale(locale: Locale): boolean;
  subscribe(subscriber: (locale: Locale) => void): () => void;
}
export const LOCALE_STORAGE_KEY: "memory-garden-locale";
export const SUPPORTED_LOCALES: readonly Locale[];
export function createI18n(options?: {
  navigatorLanguage?: string;
  storedLocale?: string;
  storage?: Pick<Storage, "getItem" | "setItem">;
}): I18n;
export function translateEnglish(key: string, values?: TranslationValues): string;
