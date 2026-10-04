// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TodayRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("today UTC day rollover", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let dates: string[]; let rollover: { delay: number; run: () => void } | undefined;
  beforeEach(async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-04T23:59:00.000Z"));
    const realSet = globalThis.setTimeout.bind(globalThis);
    const realClear = globalThis.clearTimeout.bind(globalThis);
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (typeof delay === "number" && delay >= 1000) { rollover = { delay, run: () => { if (typeof fn === "function") fn(...args); } }; return 1 as unknown as ReturnType<typeof setTimeout>; }
      return realSet(fn, delay, ...args);
    }) as typeof setTimeout);
    vi.spyOn(globalThis, "clearTimeout").mockImplementation(((id?: ReturnType<typeof setTimeout>) => { if (id !== (1 as unknown as ReturnType<typeof setTimeout>)) realClear(id); }) as typeof clearTimeout);
    browser = new Window({ url: "https://app.test/today" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    dates = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes("/api/today")) return json({});
      const date = dates.length === 0 ? "2026-10-04" : "2026-10-05";
      dates.push(date);
      return json(snapshot(date));
    });
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("reads the next UTC day when the open today page crosses midnight", async () => {
    await act(async () => root.render(<TodayRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} />));
    await flush();
    expect(container.textContent).toContain("2026-10-04");
    expect(dates).toEqual(["2026-10-04"]);
    expect(rollover?.delay).toBe(60_000);
    await act(async () => rollover?.run());
    await flush();
    expect(dates).toEqual(["2026-10-04", "2026-10-05"]);
    expect(container.textContent).toContain("2026-10-05");
  });
});

function snapshot(date: string) {
  return { date, tasks: { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }, taskSummary: { todo: 0, doing: 0, blocked: 0, done: 0, canceled: 0, dueToday: 0, overdue: 0 }, calendar: [], inbox: [], projects: [] };
}
function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
