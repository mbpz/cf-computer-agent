export type ThemeMode = "light" | "dark" | "system";
export interface ThemeDocument {
  documentElement: {
    classList: {
      toggle(name: string, force?: boolean): void;
    };
  };
}

interface ThemeRuntimeGlobal {
  matchMedia?: (query: string) => { matches: boolean };
}

const STORAGE_KEY = "memory-garden-theme";

export function readTheme(storage?: Pick<Storage, "getItem">): ThemeMode {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : "system";
  } catch {
    return "system";
  }
}

/**
 * Applies the mode to the document and stores it. Returns whether the value is
 * durably stored: a browser that rejects the write (or no storage target) is
 * reported as not persisted, so a caller never claims the choice survived a reload.
 */
export function applyTheme(mode: ThemeMode, documentRef?: ThemeDocument, storage?: Pick<Storage, "getItem" | "setItem">): boolean {
  if (documentRef) {
    const runtimeGlobal = globalThis as unknown as ThemeRuntimeGlobal;
    const prefersDark = typeof runtimeGlobal.matchMedia === "function" && runtimeGlobal.matchMedia("(prefers-color-scheme: dark)").matches;
    documentRef.documentElement.classList.toggle("dark", mode === "dark" || (mode === "system" && prefersDark));
  }
  if (!storage) return false;
  try { storage.setItem(STORAGE_KEY, mode); return true; } catch { return false; }
}

export { STORAGE_KEY as THEME_STORAGE_KEY };
