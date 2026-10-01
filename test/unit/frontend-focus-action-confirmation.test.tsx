// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { FocusPage } from "../../frontend/pages/focus-page";


const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("focus terminal action confirmation", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let write: ReturnType<typeof vi.fn>;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const session = { id: "focus-one", clientKey: "start-one", taskId: "task-one", calendarEventId: "event-one", startTitle: "Study", durationMinutes: 25, status: "active" as const, startedAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.001Z", pausedAt: null, endedAt: null, elapsedMs: 1000 };
  const ready = { kind: "ready" as const, session };
  const deny = () => {};
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/focus" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); write = vi.fn();
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function mount(extra: Record<string, unknown> = {}) {
    await act(async () => root.render(<FocusPage locale={locale} state={ready} memberId="alice" onDenied={deny} onTransition={write} {...extra} />));
  }
  function action(label: string) { const button = [...container.querySelectorAll("button")].find(node => node.textContent === label); expect(button, label).toBeDefined(); return button!; }
  const dialog = () => container.querySelector('[role="alertdialog"]');
  const confirm = () => container.querySelector<HTMLButtonElement>('[data-confirm-action]')!;
  async function click(button: HTMLButtonElement) { await act(async () => button.click()); }
  it.each(["Complete", "Abandon"])("confirms %s once with exact session and linked calendar impact", async name => {
    await mount(); const trigger=action(name);trigger.focus();await click(trigger);expect(write).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain("Study (focus-one)");expect(dialog()?.textContent).toContain("task-one");expect(dialog()?.textContent).toContain("event-one");
    expect(dialog()?.textContent).toContain(name === "Complete" ? "Active → Completed" : "Active → Abandoned");
    expect(dialog()?.textContent).toContain("cannot resume");expect(dialog()?.textContent).toContain("does not complete or delete the task");
    expect(dialog()?.getAttribute("aria-modal")).toBe("true");expect(browser.document.activeElement?.textContent).toBe("Cancel");expect(container.querySelector("section")?.hasAttribute("inert")).toBe(true);
    const submit=confirm();await act(async()=>{submit.click();submit.click();});expect(write).toHaveBeenCalledExactlyOnceWith(name.toLowerCase());expect(dialog()).toBeNull();
  });
  it.each(["cancel", "escape", "overlay"])("%s is write-free and restores focus",async mode=>{
    await mount();const trigger=action("Abandon");trigger.focus();await click(trigger);expect(write).not.toHaveBeenCalled();
    if(mode==="cancel") await click(action("Cancel"));
    else if(mode==="escape") await act(async()=>dialog()!.dispatchEvent(new browser.KeyboardEvent("keydown",{key:"Escape",bubbles:true}) as unknown as Event));
    else await click(container.querySelector('[data-dialog-open="true"] > [aria-hidden="true"]') as HTMLButtonElement);
    expect(write).not.toHaveBeenCalled();expect(dialog()).toBeNull();expect(browser.document.activeElement).toBe(trigger);
  });
  it.each(["session", "version", "task", "calendar", "status", "empty", "loading", "error", "member", "selection", "pending", "handler"])("revokes stale %s and does not revive",async change=>{
    await mount();await click(action("Complete"));expect(write).not.toHaveBeenCalled();const old=confirm();expect(old).not.toBeNull();
    const extra=change==="session"?{state:{...ready,session:{...session}}}:change==="version"?{state:{...ready,session:{...session,updatedAt:"2026-10-01T00:00:01.000Z"}}}:change==="task"?{state:{...ready,session:{...session,taskId:"task-two"}}}:change==="calendar"?{state:{...ready,session:{...session,calendarEventId:"event-two"}}}:change==="status"?{state:{...ready,session:{...session,status:"paused"}}}:change==="empty"?{state:{kind:"ready",session:null}}:change==="loading"?{state:{kind:"loading"}}:change==="error"?{state:{kind:"error",message:"Denied"}}:change==="member"?{memberId:"bob"}:change==="selection"?{selectionVersion:1}:change==="pending"?{pending:true}:{onTransition:undefined};
    await mount(extra);expect(dialog()).toBeNull();await click(old);await mount();expect(dialog()).toBeNull();expect(write).not.toHaveBeenCalled();
  });
  it("keeps the first terminal decision and blocks same-tick pause behind it",async()=>{
    await mount();const complete=action("Complete"),abandon=action("Abandon"),pause=action("Pause");await act(async()=>{complete.click();abandon.click();pause.click();});expect(write).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain("Active → Completed");await click(confirm());expect(write).toHaveBeenCalledExactlyOnceWith("complete");
  });
  it("preserves immediate pause/resume when no confirmation is open",async()=>{
    await mount();await click(action("Pause"));expect(write).toHaveBeenCalledExactlyOnceWith("pause");write.mockClear();await mount({state:{...ready,session:{...session,status:"paused"}}});await click(action("Resume"));expect(write).toHaveBeenCalledExactlyOnceWith("resume");
  });
  it("blocks resume behind a paused-session decision and allows it after cancel",async()=>{
    await mount({state:{...ready,session:{...session,status:"paused"}}});const finish=action("Abandon"),resume=action("Resume");await act(async()=>{finish.click();resume.click();});expect(write).not.toHaveBeenCalled();await click(action("Cancel"));await click(resume);expect(write).toHaveBeenCalledExactlyOnceWith("resume");
  });
  it("does not revive a decision after leaving the page",async()=>{
    await mount();await click(action("Complete"));expect(write).not.toHaveBeenCalled();const old=confirm();await act(async()=>root.render(<p>Other route</p>));await click(old);await mount();expect(dialog()).toBeNull();expect(write).not.toHaveBeenCalled();
  });
  it("keeps a decision through unrelated notice rerenders",async()=>{
    await mount();await click(action("Complete"));expect(write).not.toHaveBeenCalled();await mount({actionNotice:"Earlier outcome"});expect(dialog()).not.toBeNull();await click(confirm());expect(write).toHaveBeenCalledExactlyOnceWith("complete");
  });
  it("uses Chinese ID fallback and explains no calendar association",async()=>{
    await mount({locale:createLocaleRuntime({navigatorLanguage:"zh-CN"}),state:{...ready,session:{...session,startTitle:null,calendarEventId:null}}});await click(action("放弃"));expect(write).not.toHaveBeenCalled();expect(dialog()?.textContent).toContain("focus-one");expect(dialog()?.textContent).toContain("没有关联日程");expect(dialog()?.textContent).toContain("无法恢复");
    await act(async()=>dialog()!.dispatchEvent(new browser.KeyboardEvent("keydown",{key:"Tab",shiftKey:true,bubbles:true}) as unknown as Event));expect(browser.document.activeElement).toBe(confirm());
  });
});
