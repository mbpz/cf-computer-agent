// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentHistoryList } from "../../frontend/components/agent/agent-history-list";
import { AgentPage } from "../../frontend/pages/agent-page";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";

vi.mock("../../frontend/lib/markdown-renderer", () => ({ renderSafeMarkdown: (text: string) => <div data-test-markdown>{text}</div> }));

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));

// happy-dom evaluates its own node:vm script while loading, so it has to be
// imported after the vm mocks above are installed instead of statically.
const { Window } = await import("happy-dom");

const FIELDS = ":scope > span";

function answer(confidence: "high" | "low") {
  return { kind: "ready" as const, answer: "Use the guide.", confidence, citations: [] };
}

describe("agent page summary row", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const language = createLocaleRuntime({ navigatorLanguage: "en" });
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/agent" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("fuses question, scope and low confidence into one clamped line", async () => {
    await mount(<AgentPage locale={language} scope="space:personal" question="Where is the guide?" state={answer("low")} />);
    const fields = [...summaryRow().querySelectorAll<HTMLElement>(FIELDS)];
    expect(summaryRow().className).toContain("line-clamp-1");
    expect(fields).toHaveLength(3);
    expect(fields[0]!.textContent).toContain(frontendText(language, "AGENT_QUESTION_LABEL"));
    expect(fields[0]!.textContent).toContain("Where is the guide?");
    expect(fields[1]!.textContent).toContain(frontendText(language, "AGENT_SCOPE"));
    expect(fields[1]!.textContent).toContain("space:personal");
    expect(fields[2]!.textContent).toContain(frontendText(language, "AGENT_CONFIDENCE_LOW"));
    expect(container.textContent).not.toContain("undefined");
  });

  it("drops the confidence field unless the answer is low confidence", async () => {
    await mount(<AgentPage locale={language} scope="all" question="Where is the guide?" state={answer("high")} />);
    expect([...summaryRow().querySelectorAll(FIELDS)]).toHaveLength(2);
    expect(summaryRow().textContent).not.toContain(frontendText(language, "AGENT_CONFIDENCE_LOW"));
    expect(container.textContent).toContain(frontendText(language, "AGENT_CONFIDENCE_HIGH"));
  });

  it("keeps the loading marker and every question field in the DOM", async () => {
    await mount(<AgentPage locale={language} scope="collection:notes" question="Pending question" state={{ kind: "loading" }} />);
    expect(container.querySelector('[data-page-state="loading"][aria-busy="true"]')).toBeTruthy();
    const fields = [...summaryRow().querySelectorAll<HTMLElement>(FIELDS)];
    expect(fields).toHaveLength(2);
    expect(fields[0]!.textContent).toContain("Pending question");
    expect(fields[1]!.textContent).toContain("collection:notes");
  });

  it("clamps a fused row that overflows and expands it to at most two lines on demand", async () => {
    const page = () => <AgentPage locale={language} scope="items:one,two" question="Where is the guide?" state={answer("low")} />;
    await mount(page());
    expect(toggle()).toBeNull();
    Object.defineProperty(summaryRow(), "scrollHeight", { configurable: true, value: 64 });
    Object.defineProperty(summaryRow(), "clientHeight", { configurable: true, value: 16 });
    await act(async () => { root.render(page()); });
    expect(toggle()!.textContent).toBe(frontendText(language, "COMMON_EXPAND"));
    expect(toggle()!.getAttribute("aria-expanded")).toBe("false");
    await act(async () => toggle()!.click());
    expect(toggle()!.textContent).toBe(frontendText(language, "COMMON_COLLAPSE"));
    expect(toggle()!.getAttribute("aria-expanded")).toBe("true");
    expect(summaryRow().className).toContain("line-clamp-2");
    expect([...summaryRow().querySelectorAll(FIELDS)]).toHaveLength(3);
    expect(summaryRow().textContent).toContain(frontendText(language, "AGENT_CONFIDENCE_LOW"));
    await act(async () => toggle()!.click());
    expect(toggle()!.getAttribute("aria-expanded")).toBe("false");
    expect(summaryRow().className).toContain("line-clamp-1");
  });

  it("reserves desktop fill height for the page root and the history list", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ items: [{ id: "conv-1", createdAt: "2026-09-09T10:00:00.000Z" }] }));
    await mount(<><AgentPage locale={language} scope="all" question="Where is the guide?" state={answer("high")} /><AgentHistoryList locale={language} /></>);
    const pageRoot = container.querySelector("section")!;
    expect(pageRoot.className).toContain("lg:h-full");
    expect(pageRoot.className).toContain("lg:min-h-0");
    expect(pageRoot.className).not.toMatch(/(^|\s)h-full/);
    await act(async () => historyTrigger().click());
    await flush();
    const history = container.querySelector<HTMLElement>(`section[aria-label="${frontendText(language, "AGENT_LIST_TITLE")}"]`)!;
    expect(history.className).toContain("lg:min-h-0");
    expect(history.className).toContain("lg:flex-1");
    const region = history.querySelector<HTMLElement>(":scope > div")!;
    expect(region.className).toContain("overflow-auto");
    expect(region.className).toContain("lg:min-h-0");
    expect(region.className).toContain("lg:flex-1");
    expect(region.textContent).toContain("conv-1");
  });

  it("keeps the history status markers inside the scrolling region", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("offline"); });
    await mount(<AgentHistoryList locale={language} />);
    await act(async () => historyTrigger().click());
    await flush();
    const history = container.querySelector<HTMLElement>(`section[aria-label="${frontendText(language, "AGENT_LIST_TITLE")}"]`)!;
    const region = history.querySelector<HTMLElement>(":scope > div")!;
    expect(region.querySelector('[role="alert"]')).toBeTruthy();
    expect([...region.querySelectorAll("button")].map((button) => button.textContent)).toContain(frontendText(language, "AGENT_LIST_RETRY"));
  });

  async function mount(element: React.ReactNode) { await act(async () => root.render(element)); await flush(); }
  function summaryRow() { return container.querySelector<HTMLElement>("[data-summary-row]")!; }
  function toggle() { return container.querySelector<HTMLButtonElement>("[data-summary-row] + button"); }
  function historyTrigger() { return [...container.querySelectorAll("button")].find((button) => button.textContent === frontendText(language, "AGENT_LIST_TITLE"))!; }
});

async function flush() {
  const settled = Promise.withResolvers<void>();
  setTimeout(settled.resolve, 0);
  await act(async () => { await settled.promise; for (let index = 0; index < 12; index += 1) await Promise.resolve(); });
}
