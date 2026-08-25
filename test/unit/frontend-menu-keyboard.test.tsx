// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../frontend/components/ui/dropdown-menu";
import { menuKeyAction } from "../../frontend/lib/menu-keyboard";

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
});
