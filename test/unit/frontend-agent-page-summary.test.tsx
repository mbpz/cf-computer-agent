// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentTranscript } from "../../frontend/components/agent/agent-transcript";
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

  it("keeps exactly one titled h1 and the summary line mounted through loading and a read failure", async () => {
    await mount(<AgentPage locale={language} scope="all" question="Pending question" state={{ kind: "loading" }} />);
    const headings = () => [...container.querySelectorAll("h1")];
    expect(headings()).toHaveLength(1);
    expect(headings()[0]!.textContent).toBe(frontendText(language, "AGENT_TITLE"));
    expect(headings()[0]!.closest("header")).toBeTruthy();
    expect(summaryRow().textContent).toContain("Pending question");
    await act(async () => root.render(<AgentPage locale={language} scope="all" question="Pending question" state={{ kind: "error", message: "Retry later" }} />));
    await flush();
    expect(headings()).toHaveLength(1);
    expect(headings()[0]!.textContent).toBe(frontendText(language, "AGENT_TITLE"));
    expect(summaryRow().textContent).toContain("Pending question");
    expect(container.textContent).toContain("Retry later");
  });

  it("draws the pending turn as beUI conversation parts in the active locale", async () => {
    const chinese = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    await mount(<AgentPage locale={chinese} scope="all" question="证据在哪里？" stage="evidence" state={{ kind: "loading" }} />);
    const pending = container.querySelector<HTMLElement>('[data-page-state="loading"][aria-busy="true"]')!;
    expect(pending.querySelector('[data-state="streaming"]')).toBeTruthy();
    expect(pending.querySelector('[data-content="step"]')).toBeTruthy();
    expect(pending.textContent).toContain(frontendText(chinese, "AGENT_STAGE_EVIDENCE"));
    expect(pending.textContent).toContain(frontendText(chinese, "AGENT_STAGE_VALIDATING"));
    // The activity component's own English defaults must never reach the DOM.
    expect(pending.textContent).not.toContain("Thinking");
    expect(pending.textContent).not.toContain("Searching the web");
    expect(container.textContent).not.toContain(frontendText(language, "AGENT_STOP"));
  });

  it("names restored transcript rows in the active locale and keeps their citations", async () => {
    const chinese = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    await mount(<AgentTranscript locale={chinese} messages={[
      { role: "user", content: "旧问题", citations: [] },
      { role: "assistant", content: "旧回答", citations: [{ id: "cite-1", href: "/knowledge/k1#cite-1", title: "条目" }] },
    ]} />);
    const transcript = container.querySelector<HTMLElement>(`section[aria-label="${frontendText(chinese, "AGENT_HISTORY")}"]`)!;
    const rows = [...transcript.querySelectorAll<HTMLElement>('[data-slot="message"]')];
    expect(rows.map((row) => row.getAttribute("data-from"))).toEqual(["user", "assistant"]);
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([frontendText(chinese, "AGENT_QUESTION_LABEL"), frontendText(chinese, "AGENT_HISTORY_ANSWER")]);
    expect(transcript.querySelector('[aria-label="user message"]')).toBeNull();
    expect(transcript.querySelector('[aria-label="assistant message"]')).toBeNull();
    const log = transcript.querySelector<HTMLElement>('[role="log"]')!;
    expect(log.textContent).toContain("旧问题");
    expect(log.textContent).toContain("旧回答");
    expect(transcript.querySelector('a[href="/knowledge/k1#cite-1"]')!.textContent).toBe("条目");
    // The transcript scrolls inside its own bounded viewport, not the page.
    const viewport = log.parentElement!;
    expect(viewport.className).toContain("h-80");
    expect(viewport.className).toContain("lg:h-96");
    expect(viewport.className).not.toContain("h-full");
  });

  async function mount(element: React.ReactNode) { await act(async () => root.render(element)); await flush(); }
  function summaryRow() { return container.querySelector<HTMLElement>("[data-summary-row]")!; }
  function toggle() { return container.querySelector<HTMLButtonElement>("[data-summary-row] + button"); }
});

async function flush() {
  const settled = Promise.withResolvers<void>();
  setTimeout(settled.resolve, 0);
  await act(async () => { await settled.promise; for (let index = 0; index < 12; index += 1) await Promise.resolve(); });
}
