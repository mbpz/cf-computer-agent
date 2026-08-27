// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HomePage } from "../../frontend/pages/home-page";
import { AdminDashboardPage } from "../../frontend/pages/admin/admin-dashboard-page";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

describe("workspace dashboard", () => {
  it("renders quick actions and explicit empty states without undefined values", () => {
    const html = renderToStaticMarkup(<HomePage locale={createLocaleRuntime({ navigatorLanguage: "en" })} state={{ kind: "ready", total: 4, pending: 1, published: 3, recent: [] }} />);
    expect(html).toContain("Submit knowledge");
    expect(html).toContain("No recent knowledge yet.");
    expect(html).toContain("Open AI knowledge base");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
  });

  it("exposes admin shortcuts for site analytics and governance", () => {
    const html = renderToStaticMarkup(<AdminDashboardPage locale={createLocaleRuntime({ navigatorLanguage: "en" })} metrics={{ pending: 1, assets: 0, members: 5 }} />);
    expect(html).toContain("Site analytics");
    expect(html).toContain("Roles &amp; permissions");
    expect(html).toContain("Menu tree");
  });
});
