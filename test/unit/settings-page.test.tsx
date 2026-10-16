// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsPage } from "../../frontend/pages/settings-page";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

describe("settings page", () => {
  it("renders account and appearance controls without undefined values", () => {
    const html = renderToStaticMarkup(<SettingsPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} email="admin@example.com" role="admin" />);
    expect(html).toContain("Settings");
    expect(html).toContain("admin@example.com");
    expect(html).toContain("Appearance");
    expect(html).not.toContain("undefined");
  });

  it("opens with one titled h1 above the preference cards", () => {
    const html = renderToStaticMarkup(<SettingsPage locale={createLocaleRuntime({ navigatorLanguage: "zh-CN" })} email="admin@example.com" role="contributor" />);
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<h1[^>]*>设置<\/h1>/u);
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("管理工作区偏好设置。"));
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf(">账号<"));
    // The language preference keeps its historical accessible name and native control.
    expect(html).toContain('class="sr-only">语言</span>');
    expect(html).toContain("<select");
  });
});
