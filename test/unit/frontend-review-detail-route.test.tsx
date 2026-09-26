// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
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
  beforeEach(async () => { browser = new Window({ url: "https://app.test/admin/submissions/sub-1" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); const { createRoot } = await import("react-dom/client"); root = createRoot(container); });
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
    await act(async () => decision.resolve(published("indexed"))); await flush();
    expect(button("Publish").disabled).toBe(true); expect(container.textContent).toContain("published");
  });

  it("does not apply an old decision to a newly opened submission", async () => {
    const decision = deferred<Response>();
    const requester = withComments(async (input, init) => init?.method === "POST" ? decision.promise : preview(String(input).split("/").at(-1)!));
    await render(requester); await act(async () => button("Reject").click()); await act(async () => button("Confirm rejection").click());
    await render(requester, "sub-2"); await act(async () => decision.resolve(json({ decision: { submissionId: "sub-1", decision: "rejected" } }))); await flush();
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

  async function typeNote(value: string) {
    const input = container.querySelector("textarea[data-review-note]") as HTMLTextAreaElement;
    expect(input).toBeTruthy();
    await act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLTextAreaElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new browser.Event("input", { bubbles: true })); input.dispatchEvent(new browser.Event("change", { bubbles: true })); });
  }

  it.each(["network", "malformed", "timeout"])("keeps the exact note payload after %s and permits only explicit, deduplicated replay", async (failure) => {
    const sent: string[] = []; const retry = deferred<Response>();
    const requester = withComments(async (_input, init) => {
      if (init?.method !== "POST") return preview("sub-1");
      sent.push(String(init.body));
      if (sent.length > 1) return retry.promise;
      if (failure === "network") throw new TypeError("Failed to fetch");
      return failure === "malformed" ? json({}) : new Response(null, { status: 504 });
    });
    await render(requester); await act(async () => button("Reject").click());
    await typeNote("Please verify the source");
    await act(async () => button("Confirm rejection").click()); await flush();
    expect(sent).toHaveLength(1); expect(JSON.parse(sent[0]!)).toEqual({ reasonCode: "not_relevant", note: "Please verify the source" });
    expect(button("Publish").disabled).toBe(true);
    expect((container.querySelector("textarea[data-review-note]") as HTMLTextAreaElement).disabled).toBe(true);
    expect(container.textContent).toContain("The result is unknown");
    expect(container.textContent).not.toContain("Submission rejected.");
    const again = button("Retry same decision"); await act(async () => { again.click(); again.click(); });
    expect(sent).toHaveLength(2); expect(sent[1]).toBe(sent[0]);
    await act(async () => retry.resolve(json({ decision: { submissionId: "sub-1", decision: "rejected" } }))); await flush();
    expect(container.textContent).toContain("Submission rejected.");
  });

  it("preserves unknown-operation replay while the existing locale runtime switches language", async () => {
    const language = createLocaleRuntime({ navigatorLanguage: "en" }); const bodies: string[] = []; let reads = 0;
    const requester = withComments(async (_input, init) => {
      if (init?.method !== "POST") { reads++; return preview("sub-1"); }
      bodies.push(String(init.body)); return bodies.length === 1 ? new Response(null, { status: 503 }) : published("indexed");
    });
    await act(async () => root.render(<ReviewDetailRoute id="sub-1" locale={language} requester={requester} />)); await flush();
    await act(async () => button("Publish").click()); await flush();
    await act(async () => { language.setLocale("zh-CN"); root.render(<ReviewDetailRoute id="sub-1" locale={language} requester={requester} />); });
    expect(reads).toBe(1); expect(button("驳回").disabled).toBe(true);
    await act(async () => button("重试原决定").click()); await flush();
    expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]); expect(container.textContent).toContain("已发布，可以搜索");
  });

  it("ignores a decision that arrives after the review session is unmounted", async () => {
    const response = deferred<Response>();
    const requester = withComments(async (_input, init) => init?.method === "POST" ? response.promise : preview("sub-1"));
    await render(requester); await act(async () => button("Publish").click());
    await act(async () => root.render(<p>Signed out</p>));
    await act(async () => response.resolve(published("indexed"))); await flush();
    expect(container.textContent).toBe("Signed out"); expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("sends the selected rejection reason and blocks notes exceeding UTF-8 limit", async () => {
    const sent: unknown[] = [];
    await render(withComments(async (_input, init) => {
      if (init?.method !== "POST") return preview("sub-1");
      sent.push(JSON.parse(String(init.body))); return json({ decision: { submissionId: "sub-1", decision: "rejected" } });
    }));
    await act(async () => button("Reject").click()); await typeNote("中".repeat(1334));
    expect(button("Confirm rejection").disabled).toBe(true); expect(sent).toHaveLength(0);
    await typeNote("Duplicate source");
    const select = container.querySelector('select[data-review-reason]') as HTMLSelectElement;
    await act(async () => { select.value = "duplicate"; select.dispatchEvent(new browser.Event("change", { bubbles: true })); });
    await act(async () => button("Confirm rejection").click()); await flush();
    expect(sent).toEqual([{ reasonCode: "duplicate", note: "Duplicate source" }]);
  });

  it("keeps rejected validation input editable but does not resend it automatically", async () => {
    let posts = 0;
    await render(withComments(async (_input, init) => init?.method === "POST" ? (posts++, new Response(null, { status: 400 })) : preview("sub-1")));
    await act(async () => button("Request changes").click()); await typeNote("Please add references");
    await act(async () => button("Confirm request for changes").click()); await flush();
    expect(posts).toBe(1); expect((container.querySelector("textarea[data-review-note]") as HTMLTextAreaElement).value).toBe("Please add references");
    expect(button("Confirm request for changes").disabled).toBe(false);
  });

  it("does not erase an unknown publish outcome when exact replay fails target validation", async () => {
    const bodies: string[] = []; let reads = 0;
    await render(withComments(async (_input, init) => {
      if (init?.method !== "POST") return preview("sub-1", ++reads > 1 ? "published" : "review_pending");
      bodies.push(String(init.body));
      if (bodies.length === 1) throw new TypeError("Response lost after commit");
      return new Response(JSON.stringify({ error: { code: "PUBLICATION_TARGET_INVALID", message: "Target unavailable", retryable: false } }), { status: 400 });
    }));
    await act(async () => button("Publish").click()); await flush();
    await act(async () => button("Retry same decision").click()); await flush();
    expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]);
    expect(button("Reject").disabled).toBe(true); expect(button("Publish").disabled).toBe(true);
    expect(container.textContent).not.toContain("was not accepted");
    await act(async () => button("Reload current state").click()); await flush();
    expect(reads).toBe(2); expect(bodies).toHaveLength(2); expect(button("Reject").disabled).toBe(true);
  });

  it.each([false, true])("keeps an uncertain decision locked when readback remains pending (read failure: %s)", async (failRead) => {
    const bodies: string[] = []; let reads = 0;
    await render(withComments(async (_input, init) => {
      if (init?.method === "POST") {
        bodies.push(String(init.body));
        return new Response(null, { status: bodies.length === 1 ? 503 : 400 });
      }
      reads++;
      if (failRead && reads === 2) return new Response(null, { status: 503 });
      return preview("sub-1");
    }));
    await act(async () => button("Publish").click()); await flush();
    await act(async () => button("Retry same decision").click()); await flush();
    await act(async () => button("Reload current state").click()); await flush();
    if (failRead) { await act(async () => button("Try again").click()); await flush(); }
    expect(button("Publish").disabled).toBe(true); expect(button("Reject").disabled).toBe(true);
    expect(button("Reload current state")).toBeTruthy();
    expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]);
  });

  it("reloads a conflict without reissuing the write or allowing overwrite", async () => {
    let reads = 0; let posts = 0;
    await render(withComments(async (_input, init) => {
      if (init?.method === "POST") { posts++; return new Response(null, { status: 409 }); }
      reads++; return preview("sub-1", reads > 1 ? "rejected" : "review_pending");
    }));
    await act(async () => button("Publish").click()); await flush();
    expect(button("Reject").disabled).toBe(true); expect(container.textContent).toContain("The submission state changed");
    expect(container.textContent).not.toContain("Retry same decision");
    await act(async () => button("Reload current state").click()); await flush();
    expect(posts).toBe(1); expect(reads).toBe(2); expect(button("Publish").disabled).toBe(true);
    expect(container.textContent).toContain("rejected");
  });

  it.each([
    ["indexed", "Published and searchable."], ["pending", "Published. Search indexing is pending."],
    ["search_degraded", "Published. Search is currently degraded."], ["failed", "Published. Search indexing failed."],
  ])("shows %s separately from the completed publication", async (status, message) => {
    await render(withComments(async (_input, init) => init?.method === "POST" ? published(status) : preview("sub-1")));
    await act(async () => button("Publish").click()); await flush();
    expect(container.textContent).toContain(message); expect(container.textContent).toContain("rev-1"); expect(container.textContent).toContain("ki-1");
    expect(button("Publish").disabled).toBe(true);
  });
});

function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
function preview(id: string, status = "review_pending") { return json({ preview: { submissionId: id, submitterId: "member-1", status, requestedSpaceId: "default", requestedVisibility: "shared", requestedCollectionId: null, tagIds: [], title: `Title ${id}`, rawContent: `Content ${id}`, sourceVersion: { id: "version-1", content: `Content ${id}`, kind: "markdown", parserVersion: "m1" }, safety: { status: "safe", findings: [] }, chunks: [] } }); }
function published(searchStatus: string) { return json({ revision: { id: "rev-1", knowledgeItemId: "ki-1", searchStatus } }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
