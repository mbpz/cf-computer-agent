export type Locale = "en" | "zh-CN";
export type TranslationValues = Readonly<Record<string, string | number>>;
export interface I18n {
  readonly locale: Locale;
  t(key: string, values?: TranslationValues): string;
  setLocale(locale: Locale): boolean;
  subscribe(subscriber: (locale: Locale) => void): () => void;
}
export interface TranslationBindingValue {
  readonly key?: string;
  readonly values?: TranslationValues | (() => TranslationValues);
  toString(): string;
}
export interface TranslationBindings {
  value(key: string, values?: TranslationValues | (() => TranslationValues)): TranslationBindingValue;
  computed(render: () => string): TranslationBindingValue;
  isValue(candidate: unknown): candidate is TranslationBindingValue;
  text(target: { textContent: string | null }, value: unknown): void;
  attribute(target: { setAttribute(name: string, value: string): void }, name: "aria-label" | "aria-description" | "placeholder" | "title", value: unknown): void;
  property(target: Record<string, unknown>, name: "title", value: unknown): void;
  effect(target: object, channel: string, update: () => void): void;
  refresh(): void;
}
export const LOCALE_STORAGE_KEY: "memory-garden-locale";
export const SUPPORTED_LOCALES: readonly Locale[];
export function createI18n(options?: {
  navigatorLanguage?: string;
  storedLocale?: string;
  storage?: Pick<Storage, "getItem" | "setItem">;
}): I18n;
export function createTranslationBindings(
  translate: (key: string, values?: TranslationValues) => string,
): TranslationBindings;
export function translateEnglish(key: string, values?: TranslationValues): string;
