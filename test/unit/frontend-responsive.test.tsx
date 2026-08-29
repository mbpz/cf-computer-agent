// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "../../frontend/components/shell/app-shell";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { RESPONSIVE_LAYOUT_CONTRACT } from "../../frontend/lib/responsive-contract";

describe("frontend responsive and motion gates", () => {
  it("keeps mobile navigation and desktop sidebar in one shell", () => {
    const html = renderToStaticMarkup(<AppShell session={{ member: { id: "m1", email: "a@example.com", role: "contributor" }, capabilities: ["knowledge:read"], logoutUrl: "/auth/logout" }} pathname="/" locale={createLocaleRuntime()}><p>Home</p></AppShell>);
    expect(html).toContain("lg:block");
    expect(html).toContain("lg:hidden");
    for (const className of RESPONSIVE_LAYOUT_CONTRACT.requiredClasses) expect(html).toContain(className);
    const mainClass = html.match(/<main[^>]*class="([^"]+)"/u)?.[1] ?? "";
    expect(mainClass).not.toMatch(/(?:^|\s)(?:overflow-y-auto|h-dvh|overflow-hidden)(?:\s|$)/u);
    expect(mainClass).toContain("lg:overflow-y-auto");
    expect(html).toContain('data-shell-mobile-scroll="true"');
    expect(html).toContain("max-h-dvh shrink-0 overflow-y-auto overscroll-contain lg:hidden");
  });

  it("locks reduced-motion and breakpoint assumptions", () => {
    expect(RESPONSIVE_LAYOUT_CONTRACT.breakpoints).toEqual({ mobile: 320, tablet: 768, desktop: 1280 });
    expect(RESPONSIVE_LAYOUT_CONTRACT.reducedMotion).toBe(true);
  });
});
