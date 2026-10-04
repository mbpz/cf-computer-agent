// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("../../frontend/lib/markdown-renderer", () => ({ renderSafeMarkdown: (text: string) => <div data-test-markdown>{text}</div> }));
const { Window } = await import("happy-dom");

const source: { citationId: string; knowledgeItemId: string; title?: string; spaceId?: string } = {
  citationId: "cite-1",
  knowledgeItemId: "knowledge-a",
  title: "Launch guide",
  spaceId: "space-a",
};

describe("agent source identity read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const language = createLocaleRuntime({ navigatorLanguage: "en" });
  beforeEach(() => {
    source.title = "Launch guide";
    source.spaceId = "space-a";
    browser = new Window({ url: "https://app.test/agent" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not label a missing source title as untitled", async () => {
    delete source.title;
    await ask();
    expect(container.textContent).toContain("Unconfirmed question");
    expect(container.textContent).not.toContain("Grounded answer");
    expect(container.textContent).not.toContain("Untitled knowledge");
  });

  it("does not label a missing source space as not provided", async () => {
    delete source.spaceId;
    await ask();
    expect(container.textContent).toContain("Unconfirmed question");
    expect(container.textContent).not.toContain("Launch guide");
    expect(container.textContent).not.toContain("Not provided");
  });

  it("shows an explicit source title and space", async () => {
    await ask();
    expect(container.textContent).toContain("Grounded answer");
    expect(container.textContent).toContain("Launch guide");
    expect(container.textContent).toContain("space-a");
    expect(container.textContent).not.toContain("Unconfirmed question");
    expect(container.textContent).not.toContain("Untitled knowledge");
    expect(container.textContent).not.toContain("Not provided");
  });

  it("shows an explicit blank title as untitled", async () => {
    source.title = "";
    await ask();
    expect(container.textContent).toContain("Grounded answer");
    expect(container.textContent).toContain("Untitled knowledge");
    expect(container.textContent).toContain("space-a");
    expect(container.textContent).not.toContain("Unconfirmed question");
  });

  async function ask() {
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      const key = new Headers(init?.headers).get("idempotency-key");
      return Response.json({
        answer: "Grounded answer",
        conversationId: "conv-1",
        evidenceConfidence: 0.9,
        citations: ["cite-1"],
        sources: [{ ...source }],
        idempotencyKey: key,
      });
    });
    await act(async () => root.render(<AgentRoute locale={language} memberId="member-a" />));
    await flush();
    const input = container.querySelector<HTMLInputElement>("#agent-question")!;
    await act(async () => {
      input.value = "Where is the guide?";
      const key = Object.keys(input).find((name) => name.startsWith("__reactProps$"));
      const props = key ? (input as unknown as Record<string, { onChange?: (event: { currentTarget: HTMLInputElement }) => void }>)[key] : undefined;
      props!.onChange!({ currentTarget: input });
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event));
    await flush();
  }
});

async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
