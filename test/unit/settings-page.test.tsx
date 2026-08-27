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
});
