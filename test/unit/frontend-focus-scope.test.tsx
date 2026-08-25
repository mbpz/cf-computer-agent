// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Dialog, DialogContent } from "../../frontend/components/ui/dialog";
import { Sheet, SheetContent } from "../../frontend/components/ui/sheet";
import { nextFocusableIndex } from "../../frontend/components/ui/focus-scope";

describe("modal focus scope", () => {
  it("exposes a focusable modal root for Dialog and Sheet", () => {
    const dialog = renderToStaticMarkup(<Dialog open><DialogContent><button type="button">OK</button></DialogContent></Dialog>);
    const sheet = renderToStaticMarkup(<Sheet open><SheetContent><button type="button">OK</button></SheetContent></Sheet>);
    expect(dialog).toContain('data-focus-scope="true"');
    expect(sheet).toContain('data-focus-scope="true"');
    expect(dialog).toContain('tabindex="-1"');
    expect(sheet).toContain('aria-modal="true"');
  });

  it.each([
    [0, 3, false, 1],
    [2, 3, false, 0],
    [0, 3, true, 2],
    [2, 3, true, 1],
  ])("wraps Tab focus from %s/%s backwards=%s to %s", (current, length, backwards, expected) => {
    expect(nextFocusableIndex(current, length, backwards)).toBe(expected);
  });
});
