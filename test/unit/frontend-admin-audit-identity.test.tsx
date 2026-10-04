// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuditRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const item: { id: string; action?: string; actorKind?: string; actorId?: string | null; createdAt?: string } = {
  id: "audit-a",
  action: "maintenance.drain_started",
  actorKind: "member",
  actorId: "member-a",
  createdAt: "2026-10-04T03:00:00.000Z",
};

describe("admin audit identity read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => {
    item.action = "maintenance.drain_started";
    item.actorKind = "member";
    item.actorId = "member-a";
    item.createdAt = "2026-10-04T03:00:00.000Z";
    browser = new Window({ url: "https://app.test/admin/audit" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not label a missing action as unavailable", async () => {
    delete item.action;
    await mount();
    expect(container.textContent).toContain("Audit unavailable.");
    expect(container.textContent).not.toContain("Action unavailable");
    expect(container.textContent).not.toContain("member-a");
  });

  it("does not label a missing actor as unavailable", async () => {
    delete item.actorKind;
    delete item.actorId;
    await mount();
    expect(container.textContent).toContain("Audit unavailable.");
    expect(container.textContent).not.toContain("Actor unavailable");
    expect(container.textContent).not.toContain("maintenance.drain_started");
  });

  it("does not label a missing time as unavailable", async () => {
    delete item.createdAt;
    await mount();
    expect(container.textContent).toContain("Audit unavailable.");
    expect(container.textContent).not.toContain("Date unavailable");
    expect(container.textContent).not.toContain("member-a");
  });

  it("does not keep an unknown action", async () => {
    item.action = "banana";
    await mount();
    expect(container.textContent).toContain("Audit unavailable.");
    expect(container.textContent).not.toContain("banana");
    expect(container.textContent).not.toContain("member-a");
  });

  it("shows an explicit audit event", async () => {
    await mount();
    expect(container.textContent).toContain("maintenance.drain_started");
    expect(container.textContent).toContain("member-a");
    expect(container.textContent).toContain("2026-10-04T03:00:00.000Z");
    expect(container.textContent).not.toContain("Audit unavailable.");
    expect(container.textContent).not.toContain("Action unavailable");
    expect(container.textContent).not.toContain("Actor unavailable");
    expect(container.textContent).not.toContain("Date unavailable");
  });

  it("shows the actor kind when the actor id is explicitly absent", async () => {
    item.actorId = null;
    item.actorKind = "system";
    await mount();
    expect(container.textContent).toContain("maintenance.drain_started");
    expect(container.textContent).toContain("system");
    expect(container.textContent).toContain("2026-10-04T03:00:00.000Z");
    expect(container.textContent).not.toContain("Actor unavailable");
    expect(container.textContent).not.toContain("Audit unavailable.");
  });

  async function mount() {
    vi.stubGlobal("fetch", async () => Response.json({ items: [{ ...item }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
    await act(async () => root.render(<AdminAuditRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} search="" />));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const text = container.textContent ?? "";
      if (text.includes("maintenance.drain_started") || text.includes("Action unavailable") || text.includes("Actor unavailable") || text.includes("Date unavailable") || text.includes("Audit unavailable.") || text.includes("banana")) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
  }
});
