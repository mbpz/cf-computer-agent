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
      const template = ownCatalogValue(catalogs[locale], key) ?? ownCatalogValue(en, key);
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
  const template = ownCatalogValue(en, key);
  return template === undefined ? String(key) : interpolate(template, values, key);
}

export function createTranslationBindings(translate) {
  if (typeof translate !== "function") throw new TypeError("Translation binding translator must be a function");
  const descriptors = new WeakSet();
  const records = new Set();
  const recordsByTarget = new WeakMap();
  const textNodesByTarget = new WeakMap();

  const value = (key, values = undefined) => {
    const descriptor = {
      key: String(key),
      values,
      toString() { return String(translate(descriptor.key, resolveValues(descriptor.values))); },
      [Symbol.toPrimitive]() { return descriptor.toString(); },
    };
    descriptors.add(descriptor);
    return Object.freeze(descriptor);
  };
  const bind = (target, channel, update) => {
    if (!target || (typeof target !== "object" && typeof target !== "function")) {
      throw new TypeError("Translation binding target must be an object");
    }
    let targetRecords = recordsByTarget.get(target);
    if (!targetRecords) {
      targetRecords = new Map();
      recordsByTarget.set(target, targetRecords);
    }
    const previous = targetRecords.get(channel);
    if (previous) records.delete(previous);
    const record = { target, channel, update, connected: target.isConnected !== false };
    targetRecords.set(channel, record);
    records.add(record);
    update();
  };
  const unbind = (target, channel) => {
    const targetRecords = recordsByTarget.get(target);
    const previous = targetRecords?.get(channel);
    if (!previous) return;
    records.delete(previous);
    targetRecords.delete(channel);
  };
  const applyValue = (candidate) => descriptors.has(candidate) ? candidate.toString() : String(candidate ?? "");
  const textNodeFor = (target) => {
    if (target?.nodeType === 3 && "data" in target) return target;
    const existing = textNodesByTarget.get(target);
    if (existing) return existing;
    if (target?.firstChild?.nodeType === 3 && "data" in target.firstChild) {
      textNodesByTarget.set(target, target.firstChild);
      return target.firstChild;
    }
    const textNode = target?.ownerDocument?.createTextNode("");
    if (!textNode || typeof target.insertBefore !== "function") {
      throw new TypeError("Translation binding target must be an object");
    }
    target.insertBefore(textNode, target.firstChild ?? null);
    textNodesByTarget.set(target, textNode);
    return textNode;
  };

  return Object.freeze({
    value,
    computed(render) {
      if (typeof render !== "function") throw new TypeError("Computed translation must be a function");
      const descriptor = {
        toString() { return String(render()); },
        [Symbol.toPrimitive]() { return descriptor.toString(); },
      };
      descriptors.add(descriptor);
      return Object.freeze(descriptor);
    },
    isValue(candidate) { return descriptors.has(candidate); },
    text(target, candidate) {
      const textNode = textNodeFor(target);
      if (!descriptors.has(candidate)) {
        unbind(textNode, "data");
        textNode.data = String(candidate ?? "");
        return;
      }
      bind(textNode, "data", () => { textNode.data = candidate.toString(); });
    },
    attribute(target, name, candidate) {
      if (!/^(?:alt|aria-label|aria-description|placeholder|title)$/u.test(name)) {
        throw new TypeError(`Translation attribute is not user-visible: ${name}`);
      }
      if (!descriptors.has(candidate)) {
        unbind(target, `attribute:${name}`);
        target.setAttribute(name, String(candidate ?? ""));
        return;
      }
      bind(target, `attribute:${name}`, () => { target.setAttribute(name, candidate.toString()); });
    },
    property(target, name, candidate) {
      if (name !== "title") throw new TypeError(`Translation property is not user-visible: ${name}`);
      bind(target, `property:${name}`, () => { target[name] = applyValue(candidate); });
    },
    effect(target, channel, update) {
      if (typeof update !== "function") throw new TypeError("Translation binding update must be a function");
      bind(target, `effect:${channel}`, update);
    },
    refresh() {
      for (const record of [...records]) {
        if (record.target.isConnected === false && record.connected) {
          records.delete(record);
          recordsByTarget.get(record.target)?.delete(record.channel);
          continue;
        }
        if (record.target.isConnected !== false) record.connected = true;
        record.update();
      }
    },
  });
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

function resolveValues(values) {
  return typeof values === "function" ? values() : values;
}

function ownCatalogValue(catalog, key) {
  return Object.hasOwn(catalog, key) ? catalog[key] : undefined;
}

function isLocale(value) {
  return value === "en" || value === "zh-CN";
}
