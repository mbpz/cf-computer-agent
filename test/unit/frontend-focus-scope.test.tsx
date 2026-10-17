// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Dialog, DialogContent } from "../../frontend/components/ui/dialog";
import { Sheet, SheetContent } from "../../frontend/components/ui/sheet";
import { nextFocusableIndex } from "../../frontend/components/ui/focus-scope";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// happy-dom must load after the hoisted `vi.mock("node:vm")` factories above,
// which reference the module-scope `InertVmScript` class; a static import would
// evaluate happy-dom before that class initializes.
const { Window } = await import("happy-dom");

// Dialog panels are portalled to `document.body` (the beUI payload portals
// unconditionally), so the Dialog half of this suite mounts a real DOM tree and
// addresses `document`; `renderToStaticMarkup` cannot see a portalled panel.
// The Sheet half stays static markup: the Sheet renders inline.
describe("modal focus scope", () => {
  let browser: InstanceType<typeof Window>;
  let container: HTMLElement;
  let root: Root;

  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    browser.close();
    vi.unstubAllGlobals();
  });

  it("exposes a focusable modal root for Dialog and Sheet", async () => {
    await act(async () => {
      root.render(<Dialog open><DialogContent dismissLabel="Dismiss"><button type="button">OK</button></DialogContent></Dialog>);
    });
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.dataset.focusScope).toBe("true");
    expect(dialog!.getAttribute("tabindex")).toBe("-1");

    const sheet = renderToStaticMarkup(<Sheet open><SheetContent><button type="button">OK</button></SheetContent></Sheet>);
    expect(sheet).toContain('data-focus-scope="true"');
    expect(sheet).toContain('aria-modal="true"');
  });

  it("does not expose a closed Sheet as an active modal", () => {
    const sheet = renderToStaticMarkup(<Sheet><SheetContent><button type="button">OK</button></SheetContent></Sheet>);
    expect(sheet).not.toContain('role="dialog"');
    expect(sheet).not.toContain('aria-modal="true"');
  });

  it("does not expose a closed Dialog as an active modal", async () => {
    await act(async () => {
      root.render(<Dialog><DialogContent dismissLabel="Dismiss"><button type="button">OK</button></DialogContent></Dialog>);
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector("[data-focus-scope]")).toBeNull();
  });

  it("focuses the first control, wraps Tab, and returns focus to the opener", async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return <>
        <button type="button" onClick={() => setOpen(true)}>Open</button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent dismissLabel="Dismiss">
            <button type="button">First</button>
            <button type="button">Last</button>
          </DialogContent>
        </Dialog>
      </>;
    }
    await act(async () => root.render(<Harness />));
    const opener = document.querySelector<HTMLButtonElement>("button")!;
    opener.focus();
    await act(async () => opener.click());

    const first = document.querySelector<HTMLButtonElement>('[role="dialog"] button')!;
    const last = document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')[1];
    expect(document.activeElement).toBe(first);

    await act(async () => { last.focus(); last.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }) as unknown as Event); });
    expect(document.activeElement).toBe(first);

    await act(async () => { first.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }) as unknown as Event); });
    expect(document.activeElement).toBe(last);

    await act(async () => { last.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }) as unknown as Event); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("routes one Escape through a single onOpenChange", async () => {
    const onOpenChange = vi.fn();
    await act(async () => {
      root.render(<Dialog open onOpenChange={onOpenChange}><DialogContent dismissLabel="Dismiss"><button type="button">First</button></DialogContent></Dialog>);
    });
    const first = document.querySelector<HTMLButtonElement>('[role="dialog"] button')!;
    await act(async () => { first.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }) as unknown as Event); });
    expect(onOpenChange).toHaveBeenCalledTimes(1);
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
