// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboxCreateForm } from "../../frontend/components/inbox-create-form";
import { PlanningCreateForm } from "../../frontend/components/planning-create-form";
import { CalendarCreateForm } from "../../frontend/components/calendar-create-form";
import { TimelineCreateForm } from "../../frontend/components/timeline-create-form";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { writeWorkspaceHistory, registerWorkspaceLeaveGuard } from "../../frontend/lib/workspace-location";
const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");


const variants = ["inbox", "GOALS", "PROJECTS", "calendar", "timeline"] as const;
describe.each(variants)("%s create form navigation", variant => {
  let browser: InstanceType<typeof Window>, root: Root, container: HTMLElement;
  let writes: Array<Record<string, unknown>>, respond: () => Promise<unknown>, readback: () => Promise<boolean>;
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/source" });
    for (const [name, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(name, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as never); root = createRoot(container);
    writes = []; respond = async () => ({}); readback = async () => true;
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function mount(key = "initial") {
    const props = { key, locale: createLocaleRuntime(), createMemberId: "member-a", onCreate: async (intent: any) => { writes.push(intent); return respond(); }, onCreateReadback: () => readback() };
    await act(async () => root.render(variant === "inbox" ? <InboxCreateForm {...props} /> : variant === "calendar" ? <CalendarCreateForm {...props} /> : variant === "timeline" ? <TimelineCreateForm {...props} createProjectId="project-one" /> : <PlanningCreateForm {...props} kind={variant} />));
  }
  function input() { return container.querySelector<HTMLInputElement | HTMLTextAreaElement>(variant === "inbox" ? 'textarea' : 'input')!; }
  function change(node: HTMLInputElement | HTMLTextAreaElement, value: string) {
    node.value = value;
    const key = Object.keys(node).find(k => k.startsWith("__reactProps$"))!;
    if (key) (node as any)[key].onChange({ currentTarget: node });
    else node.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event);
  }
  async function fill() {
    await act(async () => {
      change(input(), "Unsaved private draft");
      if (variant === "calendar") {
        const times = container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]');
        change(times[0]!, "2026-10-03T09:00"); change(times[1]!, "2026-10-03T10:00");
      }
    });
  }
  function submitButton() { return [...container.querySelectorAll<HTMLButtonElement>('button')].find(b => !b.hasAttribute('data-cancel-action') && !b.hasAttribute('data-confirm-action'))!; }
  async function nav(expected: string) { await act(async () => expect(writeWorkspaceHistory("push", "/target")).toBe(expected)); }
  it("protects same-event input and cancels without changing URL or draft", async () => {
    await mount();
    await act(async () => { change(input(), "Unsaved private draft"); expect(writeWorkspaceHistory("push", "/target")).toBe("deferred"); });
    expect(browser.location.pathname).toBe("/source");
    expect(browser.document.activeElement?.textContent).toBe("Keep editing");
    await act(async () => container.querySelector<HTMLButtonElement>('[data-cancel-action]')!.click());
    expect(input().value).toBe("Unsaved private draft"); expect(writes).toHaveLength(0);
  });
  it("discards only after a single admitted commit", async () => {
    await mount(); await fill(); await nav("deferred");
    const confirm = container.querySelector<HTMLButtonElement>('[data-confirm-action]')!;
    await act(async () => { confirm.click(); confirm.click(); });
    expect(browser.location.pathname).toBe("/target"); expect(browser.history.length).toBe(2);
    expect(input().value).toBe(""); expect(writes).toHaveLength(0);
  });
  it("keeps draft when a second guard blocks final admission", async () => {
    await mount(); await fill(); let blocked = false;
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: blocked ? "block" : "allow" }));
    try { await nav("deferred"); blocked = true; await act(async () => container.querySelector<HTMLButtonElement>('[data-confirm-action]')!.click());
      expect(browser.location.pathname).toBe("/source"); expect(input().value).toBe("Unsaved private draft");
    } finally { unregister(); }
  });
  it("warns on dirty document departure and removes warning after committed discard", async () => {
    await mount(); await fill(); const event = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    await nav("deferred"); await act(async () => container.querySelector<HTMLButtonElement>('[data-confirm-action]')!.click());
    const clean = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(clean); expect(clean.defaultPrevented).toBe(false);
  });
  it("blocks pending and unknown writes without offering discard or repeating POST", async () => {
    let reject!: (cause: unknown) => void; respond = () => new Promise((_yes, no) => { reject = no; });
    await mount(); await fill();
    await act(async () => { submitButton().click(); expect(writeWorkspaceHistory("push", "/target")).toBe("blocked"); });
    expect(writes).toHaveLength(1); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    await act(async () => reject(new TypeError("offline"))); await nav("blocked");
    expect(browser.location.pathname).toBe("/source"); expect(writes).toHaveLength(1);
  });
  it("blocks readback until confirmed and then admits navigation without a dirty ghost", async () => {
    let finish!: (ok: boolean) => void; readback = () => new Promise(resolve => { finish = resolve; });
    await mount(); await fill(); await act(async () => submitButton().click()); await nav("blocked");
    await act(async () => finish(true)); expect(input().value).toBe(""); await nav("committed"); expect(writes).toHaveLength(1);
  });
  it("reserves confirmation synchronously against same-event submit and edits", async () => {
    await mount(); await fill();
    const button = submitButton();
    const key = Object.keys(button).find(k => k.startsWith("__reactProps$"))!;
    await act(async () => {
      expect(writeWorkspaceHistory("push", "/target")).toBe("deferred");
      (button as any)[key].onClick();
      change(input(), "Must not replace the confirmed draft");
    });
    expect(input().value).toBe("Unsaved private draft"); expect(writes).toHaveLength(0);
    await act(async () => container.querySelector<HTMLButtonElement>('[data-cancel-action]')!.click());
    expect(input().disabled).toBe(false);
  });
  it("submits the freshest same-event draft exactly once", async () => {
    respond = () => new Promise(() => {});
    await mount(); await fill();
    const button = submitButton();
    await act(async () => { change(input(), "Fresh same-event input"); button.click(); button.click(); });
    expect(writes).toHaveLength(1);
    expect(writes[0][variant === "inbox" ? "content" : "title"]).toBe("Fresh same-event input");
    await nav("blocked");
  });
  it("protects every editable field, and reverting to defaults leaves no dirty state", async () => {
    await mount();
    if (variant === "inbox") {
      const select = container.querySelector('select')!;
      await act(async () => change(select as any, "link"));
      await nav("deferred");
      await act(async () => container.querySelector<HTMLButtonElement>('[data-cancel-action]')!.click());
      const link = container.querySelector<HTMLInputElement>('input')!;
      await act(async () => change(link, "https://example.test/draft"));
      await nav("deferred");
      await act(async () => container.querySelector<HTMLButtonElement>('[data-confirm-action]')!.click());
    }
    const controls = [...container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')];
    for (const node of controls) {
      const baseline = node.value;
      const value = node.tagName === "SELECT" ? [...(node as HTMLSelectElement).options].find(option => option.value !== baseline)!.value
        : node.type === "datetime-local" ? "2026-10-03T09:00" : "Field-only draft";
      await act(async () => change(node as any, value)); await nav("deferred");
      await act(async () => container.querySelector<HTMLButtonElement>('[data-cancel-action]')!.click());
      await act(async () => change(node as any, baseline));
      const clean = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(clean);
      expect(clean.defaultPrevented).toBe(false);
    }
    await nav("committed"); expect(writes).toHaveLength(0);
  });
  it("restores unresolved intent without offering discard or automatically repeating a write", async () => {
    respond = async () => { throw new TypeError("offline"); };
    await mount(); await fill(); await act(async () => submitButton().click());
    await mount("remount"); await nav("blocked");
    expect(input().value).toBe("Unsaved private draft"); expect(writes).toHaveLength(1);
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it("blocks failed readback after remount and unlocks only after explicit successful read retry", async () => {
    readback = async () => false;
    await mount(); await fill(); await act(async () => submitButton().click());
    await mount("remount"); await nav("blocked");
    readback = async () => true;
    await act(async () => (container.querySelector<HTMLButtonElement>('[data-create-read-retry]') ?? [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Retry list read"))!.click());
    expect(input().value).toBe(""); await nav("committed"); expect(writes).toHaveLength(1);
  });
  it("invalidates captured confirmation and removes unload warnings when unmounted", async () => {
    await mount(); await fill(); await nav("deferred");
    const button = container.querySelector<HTMLButtonElement>('[data-confirm-action]')!;
    const key = Object.keys(button).find(k => k.startsWith("__reactProps$"))!;
    const confirm = (button as any)[key].onClick;
    await act(async () => root.render(<div>New member scope</div>));
    await act(async () => confirm());
    expect(browser.location.pathname).toBe("/source"); expect(writes).toHaveLength(0);
    const event = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false); await nav("committed");
  });

});
