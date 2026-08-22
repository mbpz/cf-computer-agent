import { en } from "./locales/en.js";
import { zhCN } from "./locales/zh-CN.js";

export const LOCALE_STORAGE_KEY = "memory-garden-locale";
export const SUPPORTED_LOCALES = Object.freeze(["en", "zh-CN"]);

const catalogs = Object.freeze({ en, "zh-CN": zhCN });
const placeholderPattern = /\{([A-Za-z][A-Za-z0-9_]*)\}/gu;

export function createI18n({ navigatorLanguage = "", storedLocale, storage } = {}) {
  let locale = resolveInitialLocale(navigatorLanguage, storedLocale, storage);
  const subscribers = new Set();

  const api = {
    get locale() { return locale; },
    t(key, values = undefined) {
      const template = catalogs[locale][key] ?? en[key];
      if (template === undefined) return String(key);
      return interpolate(template, values, key);
    },
    setLocale(nextLocale) {
      if (!isLocale(nextLocale) || nextLocale === locale) return false;
      locale = nextLocale;
      try { storage?.setItem(LOCALE_STORAGE_KEY, nextLocale); } catch { /* storage is optional */ }
      for (const subscriber of [...subscribers]) subscriber(locale);
      return true;
    },
    subscribe(subscriber) {
      if (typeof subscriber !== "function") throw new TypeError("Locale subscriber must be a function");
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
  };
  return Object.freeze(api);
}

export function translateEnglish(key, values = undefined) {
  const template = en[key];
  return template === undefined ? String(key) : interpolate(template, values, key);
}

function resolveInitialLocale(navigatorLanguage, storedLocale, storage) {
  let persisted = storedLocale;
  if (persisted === undefined) {
    try { persisted = storage?.getItem(LOCALE_STORAGE_KEY); } catch { persisted = undefined; }
  }
  if (isLocale(persisted)) return persisted;
  return typeof navigatorLanguage === "string" && navigatorLanguage.toLowerCase().startsWith("zh")
    ? "zh-CN"
    : "en";
}

function interpolate(template, values, key) {
  const expected = [...template.matchAll(placeholderPattern)].map((match) => match[1]);
  const uniqueExpected = [...new Set(expected)].sort();
  const supplied = values === undefined ? [] : Object.keys(values).sort();
  if (uniqueExpected.length !== supplied.length
    || uniqueExpected.some((name, index) => name !== supplied[index])) {
    throw new TypeError(`Translation placeholder mismatch for ${key}`);
  }
  if (!uniqueExpected.length) return template;
  return template.replace(placeholderPattern, (_match, name) => String(values[name]));
}

function isLocale(value) {
  return value === "en" || value === "zh-CN";
}
