// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TagAdminPanel } from "../../frontend/components/admin/tag-admin-panel";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import type { Fetcher } from "../../frontend/lib/api";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// `happy-dom` and `react-dom/client` capture DOM globals when first evaluated, so
// they must be imported after the stub below rather than statically at the top.
const { Window } = await import("happy-dom");

const locale = createLocaleRuntime({ storage: { getItem: () => "en", setItem: () => {} } });
const existing = { id: "tag-1", spaceId: "space-1", slug: "existing", name: "Existing", status: "active" };

interface Call { readonly path: string; readonly method: string; readonly body: Record<string, unknown> | null }

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

describe("admin tag panel", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;

  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/spaces" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    browser.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function flush() {
    await act(async () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 0);
      await promise;
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
  }

  function requesterFor(create: () => Response): { requester: Fetcher; calls: Call[] } {
    const calls: Call[] = [];
    const requester: Fetcher = async (input, init) => {
      const path = typeof input === "string" ? input : input.url;
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
      calls.push({ path, method, body });
      if (method === "POST") return create();
      if (path.startsWith("/api/admin/tags")) return json({ items: [existing], nextCursor: null });
      return json({ error: { code: "NOT_FOUND", message: "NOT_FOUND", retryable: false } }, 404);
    };
    return { requester, calls };
  }

  async function mount(requester: Fetcher) {
    await act(async () => root.render(<TagAdminPanel spaceId="space-1" locale={locale} requester={requester} />));
    await flush();
  }

  function button(label: string): HTMLButtonElement {
    const element = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
    expect(element, label).toBeTruthy();
    return element as HTMLButtonElement;
  }

  async function click(label: string) {
    await act(async () => button(label).click());
    await flush();
  }

  async function typeInto(selector: string, value: string) {
    const element = container.querySelector(selector) as HTMLInputElement;
    expect(element, selector).toBeTruthy();
    await act(async () => {
      Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new browser.Event("input", { bubbles: true }));
    });
    await flush();
  }

  const posted = (calls: Call[]) => calls.filter((call) => call.method === "POST");
  const rowSlugs = () => [...container.querySelectorAll("[data-admin-tag]")].map((row) => row.getAttribute("data-admin-tag-slug-value"));

  it("creates a tag from the panel with the fields the operator typed and shows it in the list", async () => {
    const created = { id: "tag-2", spaceId: "space-1", slug: "new-tag", name: "New tag", status: "active" };
    const { requester, calls } = requesterFor(() => json({ tag: created }, 201));
    await mount(requester);
    // The scope note states what the API can and cannot do, and the panel offers no
    // rename/disable/delete control.
    expect(container.querySelector("[data-admin-tag-scope-note]")?.textContent).toContain("renaming");
    expect(button("Create tag").disabled).toBe(true);

    await typeInto("[data-admin-tag-slug]", "new-tag");
    await typeInto("[data-admin-tag-name]", "New tag");
    expect(button("Create tag").disabled).toBe(false);
    await click("Create tag");

    const send = posted(calls);
    expect(send).toHaveLength(1);
    expect(send[0]!.path).toBe("/api/admin/tags");
    // Only the panel's real fields travel: the space it governs, the slug and the name.
    expect(send[0]!.body).toEqual({ spaceId: "space-1", slug: "new-tag", name: "New tag" });
    expect(rowSlugs()).toContain("new-tag");
    expect(container.querySelector("[data-admin-tag-notice]")).toBeNull();
  });

  it("shows a slug conflict as a real conflict the admin acts on, never as success", async () => {
    const { requester, calls } = requesterFor(() => json({ error: { code: "TAG_SLUG_CONFLICT", message: "Tag slug already exists in this Space", retryable: false } }, 409));
    await mount(requester);
    const readsBefore = calls.filter((call) => call.method === "GET").length;

    await typeInto("[data-admin-tag-slug]", "existing");
    await typeInto("[data-admin-tag-name]", "Existing again");
    await click("Create tag");

    expect(posted(calls)).toHaveLength(1);
    // No row was added, the conflict is named with its server code, and the panel
    // says a retry with the same slug would be refused again.
    expect(rowSlugs()).toEqual(["existing"]);
    const notice = container.querySelector("[data-admin-tag-notice]");
    expect(notice?.textContent).toContain("TAG_SLUG_CONFLICT");
    expect(container.textContent).toContain("Nothing was created");
    expect(container.textContent).toContain("refused again");

    // Acting on it: re-read the list; the deliberate retry is a new POST the admin makes.
    await click("Re-read the tag list");
    expect(calls.filter((call) => call.method === "GET").length).toBe(readsBefore + 1);
    expect(container.querySelector("[data-admin-tag-notice]")).toBeNull();
  });

  it("reports a capability refusal and a malformed creation response without claiming success", async () => {
    const forbidden = requesterFor(() => json({ error: { code: "FORBIDDEN", message: "Forbidden", retryable: false } }, 403));
    await mount(forbidden.requester);
    await typeInto("[data-admin-tag-slug]", "blocked");
    await typeInto("[data-admin-tag-name]", "Blocked");
    await click("Create tag");
    expect(container.querySelector("[data-admin-tag-notice]")?.textContent).toContain("FORBIDDEN");
    expect(rowSlugs()).toEqual(["existing"]);

    const malformed = requesterFor(() => json({ tag: { id: "tag-3", slug: "no-space" } }, 201));
    await mount(malformed.requester);
    await typeInto("[data-admin-tag-slug]", "odd");
    await typeInto("[data-admin-tag-name]", "Odd");
    await click("Create tag");
    expect(container.querySelector("[data-admin-tag-notice]")?.textContent).toContain("TAG_RESPONSE_INVALID");
    expect(rowSlugs()).toEqual(["existing"]);
  });

  it("refuses to send an invalid slug or an empty name", async () => {
    const { requester, calls } = requesterFor(() => json({ tag: existing }, 201));
    await mount(requester);
    await typeInto("[data-admin-tag-slug]", "Not A Slug");
    await typeInto("[data-admin-tag-name]", "Name");
    expect(button("Create tag").disabled).toBe(true);
    await typeInto("[data-admin-tag-slug]", "ok-slug");
    await typeInto("[data-admin-tag-name]", "   ");
    expect(button("Create tag").disabled).toBe(true);
    expect(posted(calls)).toHaveLength(0);
  });
});
