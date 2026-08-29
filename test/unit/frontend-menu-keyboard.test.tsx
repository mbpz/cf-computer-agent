// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../frontend/components/ui/dropdown-menu";
import { menuKeyAction } from "../../frontend/lib/menu-keyboard";
import { AppShell } from "../../frontend/components/shell/app-shell";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

describe("dropdown keyboard contract", () => {
  it.each([
    ["Escape", "close"],
    ["Home", "first"],
    ["End", "last"],
    ["ArrowDown", "next"],
    ["ArrowUp", "previous"],
    ["Enter", null],
  ] as const)("maps %s to %s", (key, expected) => {
    expect(menuKeyAction(key)).toBe(expected);
  });

  it("emits menu semantics and keyboard-safe items", () => {
    const html = renderToStaticMarkup(<DropdownMenu><DropdownMenuTrigger aria-label="Open">Open</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>One</DropdownMenuItem></DropdownMenuContent></DropdownMenu>);
    expect(html).toContain('role="menu"');
    expect(html).toContain('role="menuitem"');
    expect(html).toContain('tabindex="-1"');
  });

  it("renders coming-soon navigation as an accessible non-link with a reason", () => {
    const html = renderToStaticMarkup(<AppShell session={{ member: { id: "m1", email: "member@example.test", role: "contributor" }, capabilities: ["knowledge:read"], permissionMask: "0x0", logoutUrl: "/logout" }} pathname="/" locale={createLocaleRuntime({ navigatorLanguage: "zh-CN" })}><div /></AppShell>);
    expect(html).toContain('data-nav-availability="coming_soon"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("建设中");
    expect(html).not.toContain('href="/notifications"');
    expect(html).toContain('title="通知（建设中）"');
  });
});
