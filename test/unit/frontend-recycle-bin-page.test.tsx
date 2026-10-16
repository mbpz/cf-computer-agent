// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecycleBinRoute } from "../../frontend/pages/admin/recycle-bin-route";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript {
  runInContext(context: Record<string, unknown>) {
    const globals: Record<string, unknown> = globalThis as unknown as Record<string, unknown>;
    for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) {
      context[name] = globals[name];
    }
  }
}
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// happy-dom must load after the hoisted `vi.mock` calls above install their stubs.
const { Window } = await import("happy-dom");

const locale = createLocaleRuntime({ navigatorLanguage: "en" });

describe("admin recycle bin", () => {
  let browser: InstanceType<typeof Window>;
  let container: HTMLElement;
  let root: Root;

  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/knowledge/trash" });
    for (const [key, value] of Object.entries({
      window: browser, document: browser.document, navigator: browser.navigator,
      HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
    })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    // Loaded after the happy-dom globals are installed so React DOM binds to them.
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    browser.close();
    vi.unstubAllGlobals();
  });

  async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }

  async function mount(canReview = true) {
    await act(async () => root.render(<RecycleBinRoute locale={locale} memberId="member-a" canReview={canReview} />));
    await flush();
  }

  async function type(input: HTMLInputElement, value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new browser.Event("input", { bubbles: true }));
      input.dispatchEvent(new browser.Event("change", { bubbles: true }));
    });
  }

  async function click(selector: string) {
    const element = container.querySelector(selector);
    expect(element, selector).toBeTruthy();
    await act(async () => (element as HTMLElement).click());
    await flush();
  }

  function input(selector: string): HTMLInputElement {
    const element = container.querySelector(selector);
    expect(element, selector).toBeTruthy();
    return element as HTMLInputElement;
  }

  it("sends nothing while the typed identifier does not match, and says why", async () => {
    const posts: string[] = [];
    vi.stubGlobal("fetch", async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") { posts.push(String(init.body)); return json({ purge: { knowledgeItemId: "k-1", status: "purged", purgedRevisionCount: 1 } }); }
      return trashResponse([trashedItem("k-1")]);
    });
    await mount();
    await type(input('[data-trash-purge-confirm="k-1"]'), "k-2");
    expect(container.textContent).toContain("The typed identifier does not match this item");
    expect((container.querySelector('[data-trash-purge="k-1"]') as HTMLButtonElement).disabled).toBe(true);
    await click('[data-trash-purge="k-1"]');
    expect(posts).toEqual([]);
  });

  it("sends the typed confirmation with one operation number and reports the server's count", async () => {
    const posts: string[] = [];
    const paths: string[] = [];
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") { posts.push(String(init.body)); paths.push(String(input)); return json({ purge: { knowledgeItemId: "k-1", status: "purged", purgedRevisionCount: 3 } }); }
      return trashResponse([trashedItem("k-1")]);
    });
    await mount();
    await type(input('[data-trash-purge-confirm="k-1"]'), "k-1");
    await click('[data-trash-purge="k-1"]');
    expect(posts).toHaveLength(1);
    expect(paths[0]).toBe("/api/admin/knowledge/k-1/purge");
    const body = JSON.parse(posts[0]!) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["confirm", "operationId"]);
    expect(body.confirm).toBe("k-1");
    expect(typeof body.operationId).toBe("string");
    expect(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(String(body.operationId))).toBe(true);
    expect(container.querySelector("[data-trash-feedback]")!.textContent).toContain("Purged 3 revision(s)");
    expect(container.querySelector('[data-trash-restore="k-1"]')).toBeNull();
  });

  it("drops a restored row and states the visibility the server returned", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        calls.push({ url: String(input), body: String(init.body) });
        return json({ knowledge: { id: "k-1", spaceId: "space-1", collectionId: null, revisionId: "rev-1", title: "Doc", visibility: "admin_only", status: "active", publishedAt: trashedAt, updatedAt: trashedAt, searchStatus: "indexed" } });
      }
      return trashResponse([trashedItem("k-1")]);
    });
    await mount();
    await click('[data-trash-restore="k-1"]');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/admin/knowledge/k-1/restore");
    expect(Object.keys(JSON.parse(calls[0]!.body) as Record<string, unknown>)).toEqual(["operationId"]);
    expect(container.querySelector("[data-trash-feedback]")!.textContent).toContain("admin_only");
    expect(container.querySelector('[data-trash-restore="k-1"]')).toBeNull();
  });

  it("offers a retry that resends the identical body and operation number after an unknown outcome", async () => {
    const posts: string[] = [];
    let attempts = 0;
    vi.stubGlobal("fetch", async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(String(init.body));
        attempts += 1;
        return attempts === 1 ? new Response(null, { status: 503 }) : json({ purge: { knowledgeItemId: "k-1", status: "purged", purgedRevisionCount: 2 } });
      }
      return trashResponse([trashedItem("k-1")]);
    });
    await mount();
    await type(input('[data-trash-purge-confirm="k-1"]'), "k-1");
    await click('[data-trash-purge="k-1"]');
    expect(posts).toHaveLength(1);
    expect(container.querySelector("[data-trash-feedback]")!.textContent).toContain("The outcome is unknown");
    expect(container.querySelector("[data-trash-retry-operation]")).toBeTruthy();
    await click("[data-trash-retry-operation]");
    expect(posts).toHaveLength(2);
    expect(posts[1]).toBe(posts[0]);
    expect(container.querySelector("[data-trash-feedback]")!.textContent).toContain("Purged 2 revision(s)");
  });

  it("states retention from the server facts, keeps a non-purgeable row unpurgeable and never shows a total", async () => {
    vi.stubGlobal("fetch", async () => trashResponse([trashedItem("k-9", false)]));
    await mount();
    const cell = container.querySelector('[data-trash-retention="k-9"]');
    expect(cell).toBeTruthy();
    expect(cell!.getAttribute("data-trash-purge-eligible-at")).toBe(futurePurgeEligibleAt);
    expect(cell!.textContent).toContain(futureTrashedAt);
    expect(cell!.textContent).toMatch(/\d+ day\(s\) left/);
    expect(cell!.textContent).toContain(futurePurgeEligibleAt);
    expect(container.textContent).toContain("Purge not allowed yet");
    expect((container.querySelector('[data-trash-purge="k-9"]') as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('[data-trash-purge-confirm="k-9"]')).toBeNull();
    expect(container.querySelector("[data-trash-scope]")!.textContent).toContain("nothing here is estimated");
    expect(container.textContent!.toLowerCase()).not.toContain("total");
    expect(container.querySelector("[data-trash-load-more]")).toBeNull();
  });

  it("renders no write affordance and performs no read without the review capability", async () => {
    let requests = 0;
    vi.stubGlobal("fetch", async () => { requests += 1; return trashResponse([trashedItem("k-1")]); });
    await mount(false);
    expect(container.querySelector("[data-admin-recycle-bin]")).toBeTruthy();
    expect(container.textContent).toContain("Knowledge recycle bin");
    expect(container.textContent).toContain("no longer have permission to review");
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(requests).toBe(0);
  });
});

const trashedAt = "2026-01-01T00:00:00.000Z";
const purgeEligibleAt = "2026-01-31T00:00:00.000Z";
const futureTrashedAt = "2027-01-01T00:00:00.000Z";
const futurePurgeEligibleAt = "2027-01-31T00:00:00.000Z";

function trashedItem(id: string, purgeable = true): unknown {
  return {
    id,
    spaceId: "space-1",
    collectionId: null,
    revisionId: "rev-1",
    title: "Doc",
    visibility: "shared",
    status: "trashed",
    publishedAt: trashedAt,
    updatedAt: trashedAt,
    searchStatus: "indexed",
    retention: purgeable
      ? { trashedAt, purgeEligibleAt, purgeable: true }
      : { trashedAt: futureTrashedAt, purgeEligibleAt: futurePurgeEligibleAt, purgeable: false },
  };
}

function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
function trashResponse(items: readonly unknown[], nextCursor?: string) { return json({ items, ...(nextCursor === undefined ? {} : { nextCursor }) }); }
