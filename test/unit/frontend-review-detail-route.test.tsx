// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewDetailRoute } from "../../frontend/pages/admin/review-detail-route";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import type { Fetcher } from "../../frontend/lib/api";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("review detail read recovery", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  beforeEach(() => { browser = new Window({ url: "https://app.test/admin/submissions/sub-1" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  const withComments = (requester: Fetcher): Fetcher => (input, init) => String(input).endsWith("/comments") ? Promise.resolve(json({ comments: [] })) : requester(input, init);
  async function render(requester: Fetcher, id = "sub-1") { await act(async () => root.render(<ReviewDetailRoute id={id} locale={locale} requester={requester} />)); await flush(); }
  function button(label: string) { const found = [...container.querySelectorAll("button")].find((item) => item.textContent === label) as HTMLButtonElement; expect(found).toBeTruthy(); return found; }

  it("recovers the same detail after read failure without a decision and deduplicates immediate retry", async () => {
    const pending = deferred<Response>(); const paths: string[] = []; const methods: string[] = [];
    const requester = withComments(async (input, init) => { paths.push(String(input)); methods.push(init?.method ?? "GET"); return paths.length === 1 ? new Response(null, { status: 500 }) : pending.promise; });
    await render(requester);
    const retry = button("Try again"); await act(async () => { retry.click(); retry.click(); });
    expect(paths).toEqual(["/api/admin/submissions/sub-1", "/api/admin/submissions/sub-1"]); expect(methods).toEqual(["GET", "GET"]);
    await act(async () => pending.resolve(preview("sub-1"))); await flush();
    expect(container.querySelector("h1")?.textContent).toBe("Title sub-1");
  });

  it.each([401, 403, 404])("renders a bounded %i state without content or decisions and a return link", async (status) => {
    await render(withComments(async () => new Response(null, { status })));
    expect(container.textContent).toContain(status === 404 ? "This submission was not found." : "You no longer have permission");
    expect(container.querySelector('a[href="/admin/submissions"]')).toBeTruthy();
    expect(container.querySelector("pre")).toBeNull(); expect(container.textContent).not.toContain("Publish");
  });

  it("treats a successful response missing preview as an error, not not-found", async () => {
    await render(withComments(async () => json({})));
    expect(button("Try again")).toBeTruthy();
    expect(container.textContent).not.toContain("This submission was not found.");
    expect(container.querySelector("pre")).toBeNull();
  });

  it("aborts a previous object read and prevents its late response from replacing the new object", async () => {
    const old = deferred<Response>(); let signal: AbortSignal | undefined;
    const requester = withComments(async (input, init) => {
      if (String(input).endsWith("/sub-1")) { signal = init?.signal as AbortSignal; return old.promise; }
      return preview("sub-2");
    });
    await render(requester); await render(requester, "sub-2");
    expect(signal?.aborted).toBe(true);
    await act(async () => old.resolve(preview("sub-1"))); await flush();
    expect(container.querySelector("h1")?.textContent).toBe("Title sub-2");
    expect(container.textContent).not.toContain("Content sub-1");
  });

  it("allows only one same-tick decision and preserves its successful completion", async () => {
    const decision = deferred<Response>(); let posts = 0;
    const requester = withComments(async (_input, init) => { if (init?.method === "POST") { posts++; return decision.promise; } return preview("sub-1"); });
    await render(requester);
    const publish = button("Publish"); await act(async () => { publish.click(); publish.click(); });
    expect(posts).toBe(1);
    await act(async () => decision.resolve(json({}))); await flush();
    expect(button("Publish").disabled).toBe(true); expect(container.textContent).toContain("published");
  });

  it("does not apply an old decision to a newly opened submission", async () => {
    const decision = deferred<Response>();
    const requester = withComments(async (input, init) => init?.method === "POST" ? decision.promise : preview(String(input).split("/").at(-1)!));
    await render(requester); await act(async () => button("Reject").click());
    await render(requester, "sub-2"); await act(async () => decision.resolve(json({}))); await flush();
    expect(container.querySelector("h1")?.textContent).toBe("Title sub-2"); expect(button("Publish").disabled).toBe(false);
    expect(container.textContent).not.toContain("rejected");
  });

  it.each([401, 403])("removes private content when a decision discovers permission revocation (%i)", async (status) => {
    const requester = withComments(async (_input, init) => init?.method === "POST" ? new Response(null, { status }) : preview("sub-1"));
    await render(requester); await act(async () => button("Publish").click()); await flush();
    expect(container.textContent).toContain("You no longer have permission");
    expect(container.querySelector("pre")).toBeNull();
    expect(container.textContent).not.toContain("Title sub-1");
    expect(container.textContent).not.toContain("Content sub-1");
    expect(container.textContent).not.toContain("Publish");
  });
});

function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
function preview(id: string) { return json({ preview: { submissionId: id, submitterId: "member-1", status: "review_pending", requestedSpaceId: "default", requestedVisibility: "shared", requestedCollectionId: null, tagIds: [], title: `Title ${id}`, rawContent: `Content ${id}`, sourceVersion: { id: "version-1", content: `Content ${id}`, kind: "markdown", parserVersion: "m1" }, safety: { status: "safe", findings: [] }, chunks: [] } }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
