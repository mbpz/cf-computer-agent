// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MySubmissionsRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const item: {
  id: string; title?: string; status?: string; kind?: string; content?: string;
  requestedSpaceId?: string; requestedCollectionId?: string | null; requestedVisibility?: string;
  review?: { decision: string; reasonCode: string; note: string };
} = {
  id: "submission-a",
  title: "Launch guide",
  status: "review_pending",
};

describe("my submissions identity read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => {
    item.title = "Launch guide";
    item.status = "review_pending";
    delete item.kind; delete item.content; delete item.requestedSpaceId;
    delete item.requestedCollectionId; delete item.requestedVisibility; delete item.review;
    browser = new Window({ url: "https://app.test/my-submissions" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not label a missing title as an untitled submission", async () => {
    delete item.title;
    await mount();
    expect(container.textContent).toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Untitled submission");
    expect(container.textContent).not.toContain("submission-a");
  });

  it("does not label a missing status as unavailable", async () => {
    delete item.status;
    await mount();
    expect(container.textContent).toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Status unavailable");
    expect(container.textContent).not.toContain("Launch guide");
  });

  it("does not show an unknown status as the submission state", async () => {
    item.status = "banana";
    await mount();
    expect(container.textContent).toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("banana");
    expect(container.textContent).not.toContain("Launch guide");
  });

  it("shows an explicit pending submission", async () => {
    await mount();
    expect(container.textContent).toContain("Launch guide");
    expect(container.textContent).toContain("review_pending");
    expect(container.textContent).not.toContain("Unable to load the page.");
    expect(container.textContent).not.toContain("Untitled submission");
    expect(container.textContent).not.toContain("Status unavailable");
  });

  it("keeps a blank title untitled when the status is explicit", async () => {
    item.title = "";
    await mount();
    expect(container.textContent).toContain("Untitled submission");
    expect(container.textContent).toContain("review_pending");
    expect(container.textContent).not.toContain("Unable to load the page.");
  });

  it("opens a returned item in the resubmission editor and keeps one attempt key", async () => {
    item.status = "revision_requested";
    item.kind = "markdown";
    item.content = "# Body";
    item.requestedSpaceId = "space-a";
    item.requestedCollectionId = null;
    item.requestedVisibility = "shared";
    item.review = { decision: "revision_requested", reasonCode: "needs_revision", note: "Add sources." };
    await mount("member-a");
    const action = container.querySelector("[data-my-submission-resubmit]");
    expect(action).toBeTruthy();
    await act(async () => { (action as unknown as HTMLElement).click(); await Promise.resolve(); });
    // The returned item's own source is what opens the editor, and this tab is the one editing it.
    const stored = browser.localStorage.getItem("personal-workbench:submission-resubmit:v1:member-a");
    expect(stored).toContain('"priorId":"submission-a"');
    expect(stored).toContain('"content":"# Body"');
    expect(browser.sessionStorage.getItem("personal-workbench:submission-resubmit:v1:member-a:open")).toBe("submission-a");
    expect(browser.location.pathname).toBe("/submit");
  });

  it("reports instead of offering an action when the returned item's source cannot be read", async () => {
    item.status = "revision_requested";
    await mount("member-a");
    expect(container.querySelector("[data-my-submission-resubmit]")).toBeNull();
    expect(container.querySelector("[data-my-submission-resubmit-unavailable]")).toBeTruthy();
    expect(browser.localStorage.getItem("personal-workbench:submission-resubmit:v1:member-a")).toBeNull();
  });

  async function mount(memberId?: string) {
    vi.stubGlobal("fetch", async () => Response.json({ items: [{ ...item }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
    await act(async () => root.render(<MySubmissionsRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} search="" memberId={memberId} />));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const text = container.textContent ?? "";
      if (text.includes("Launch guide") || text.includes("Untitled submission") || text.includes("Unable to load the page.")) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
  }
});
