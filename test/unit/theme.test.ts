import { describe, expect, it } from "vitest";
import { applyTheme, readTheme, type ThemeDocument, type ThemeMode } from "../../frontend/lib/theme";

describe("theme preference", () => {
  it("reads only supported stored values", () => {
    const storage = new Map<string, string>([["memory-garden-theme", "dark"]]);
    expect(readTheme({ getItem: (key) => storage.get(key) ?? null })).toBe("dark");
    expect(readTheme({ getItem: () => "invalid" })).toBe("system");
  });

  it("applies the requested class and persists it", () => {
    const classes = new Set<string>();
    const storage = new Map<string, string>();
    const documentRef = { documentElement: { classList: { toggle: (name: string, enabled: boolean) => enabled ? classes.add(name) : classes.delete(name) } } } as ThemeDocument;
    applyTheme("dark" as ThemeMode, documentRef, { getItem: () => null, setItem: (key, value) => { storage.set(key, value); } });
    expect(classes.has("dark")).toBe(true);
    expect(storage.get("memory-garden-theme")).toBe("dark");
  });
});
