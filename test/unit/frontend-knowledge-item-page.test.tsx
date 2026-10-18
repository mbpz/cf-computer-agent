// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { KnowledgeItemPage } from "../../frontend/pages/admin/knowledge-item-page";
import { AdminKnowledgeItemRoute } from "../../frontend/pages/admin/knowledge-item-route";
import { knowledgeItemWriteOutcome, type AdminKnowledgeItem, type KnowledgeRevisionSummary } from "../../frontend/lib/admin-knowledge-item-data";
import { ApiRequestError } from "../../frontend/lib/api";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const locale = () => createLocaleRuntime({ navigatorLanguage: "en" });

interface ItemOptions { id?: string; spaceId?: string; title?: string; visibility?: "shared" | "admin_only"; revisionId?: string; previousRevisionId?: string | null }
function item({ id = "knowledge-1", spaceId = "space-1", title = "Guide", visibility = "shared", revisionId = "rev-cur", previousRevisionId = "rev-prev" }: ItemOptions = {}): AdminKnowledgeItem {
  return {
    id, spaceId, collectionId: null, title, tagIds: ["tag-1"], visibility, searchStatus: "indexed",
    publishedAt: "2026-08-02T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", status: "active",
    currentRevision: { id: revisionId, title, visibility, publishedAt: "2026-08-02T00:00:00.000Z", isCurrent: true, previousRevisionId, indexStatus: "indexed" },
  };
}

function revisionHistory(): KnowledgeRevisionSummary[] {
  return [
    { id: "rev-cur", title: "Guide", visibility: "shared", publishedAt: "2026-08-02T00:00:00.000Z", isCurrent: true },
    { id: "rev-prev", title: "Guide", visibility: "shared", publishedAt: "2026-08-01T00:00:00.000Z", isCurrent: false },
  ];
}

describe("knowledge item page", () => {
  it("offers every named revision as a target and states what a rollback replaces", () => {
    const html = renderToStaticMarkup(<KnowledgeItemPage state={{ kind: "ready", item: item() }} locale={locale()} canReview
      revisions={revisionHistory()} onSelectRollback={vi.fn()} onTrash={vi.fn()} />);
    expect(html).toContain("data-knowledge-revision-history");
    expect(html).toContain('data-knowledge-rollback-target="rev-prev"');
    expect(html).toContain("Choose this revision");
    expect(html).toContain("data-knowledge-current-revision");
    expect(html).toContain("data-knowledge-previous-revision");
    expect(html).not.toContain("This item has no earlier revision");
  });

  it("asks for confirmation before a rollback is sent and shows the exact replacement", () => {
    const html = renderToStaticMarkup(<KnowledgeItemPage state={{ kind: "ready", item: item() }} locale={locale()} canReview
      revisions={revisionHistory()} confirmTarget="rev-prev" onConfirmRollback={vi.fn()} onCancelRollback={vi.fn()} />);
    expect(html).toContain("data-knowledge-rollback-confirm");
    expect(html).toContain("Confirm rollback to rev-prev");
    expect(html).toContain("This restores rev-prev as the current revision and replaces rev-cur.");
    expect(html).toContain("data-knowledge-confirm-rollback");
    expect(html).toContain("data-knowledge-cancel-rollback");
  });

  it("announces the restored revision and the one it replaced", () => {
    const html = renderToStaticMarkup(<KnowledgeItemPage state={{ kind: "ready", item: item() }} locale={locale()} canReview
      feedback={{ kind: "rolled-back", revisionId: "rev-prev", previousRevisionId: "rev-cur" }} />);
    expect(html).toContain("Rolled back: rev-prev is now the current revision; it replaced rev-cur.");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("says there is nothing to roll back to when no earlier revision or history exists", () => {
    const html = renderToStaticMarkup(<KnowledgeItemPage state={{ kind: "ready", item: item({ previousRevisionId: null }) }} locale={locale()} canReview revisions={[]} onTrash={vi.fn()} />);
    expect(html).toContain("This item has no earlier revision, so there is nothing to roll back to.");
    expect(html).toContain("No revision history is available for this item.");
    expect(html).not.toContain("data-knowledge-rollback-target");
  });

  it("renders no write affordance without the review capability", () => {
    const html = renderToStaticMarkup(<KnowledgeItemPage state={{ kind: "ready", item: item() }} locale={locale()} canReview={false} revisions={revisionHistory()} onTrash={vi.fn()} />);
    expect(html).not.toContain("data-knowledge-rollback-target");
    expect(html).not.toContain("data-knowledge-trash");
    expect(html).toContain("Knowledge item administration");
  });

  it("keeps the titled header through loading, forbidden and not-found states", () => {
    for (const state of [{ kind: "loading" as const }, { kind: "forbidden" as const, message: "Forbidden." }, { kind: "not-found" as const, message: "" }]) {
      const html = renderToStaticMarkup(<KnowledgeItemPage state={state} locale={locale()} canReview />);
      expect(html).toContain("Knowledge item administration");
      expect(html).toContain("data-admin-knowledge-item");
    }
  });
});

describe("knowledge item writes", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/knowledge/knowledge-1" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document);
    vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  async function mount() {
    await act(async () => root.render(<AdminKnowledgeItemRoute locale={locale()} knowledgeItemId="knowledge-1" memberId="member-a" canReview />));
    await flush();
  }
  async function click(selector: string) {
    const found = container.querySelector(selector) as HTMLButtonElement | null;
    expect(found, selector).toBeTruthy();
    await act(async () => found!.click());
    await flush();
  }

  it("retries an unknown outcome with the identical body and operation number", async () => {
    const posts: Array<{ url: string; body: string }> = [];
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/revisions")) return json({ revisions: revisionHistory() });
      if (init?.method === "POST") {
        posts.push({ url, body: String(init.body) });
        if (posts.length === 1) throw new TypeError("network down");
        return json({ revision: rollbackRevision(), previousRevisionId: "rev-cur" });
      }
      return json({ knowledge: knowledgePayload() });
    });
    await mount();
    await click('[data-knowledge-rollback-target="rev-prev"]');
    expect(posts).toHaveLength(0);
    await click("[data-knowledge-confirm-rollback]");
    expect(container.textContent).toContain("The outcome is unknown.");
    await click("[data-knowledge-retry-operation]");
    expect(posts).toHaveLength(2);
    expect(posts[1]!.url).toBe(posts[0]!.url);
    expect(posts[1]!.url).toBe("/api/admin/knowledge/knowledge-1/rollback");
    expect(posts[1]!.body).toBe(posts[0]!.body);
    const body = JSON.parse(posts[0]!.body) as { operationId?: string; revisionId?: string };
    expect(typeof body.operationId).toBe("string");
    expect(body.revisionId).toBe("rev-prev");
    expect(container.textContent).toContain("Rolled back: rev-prev is now the current revision; it replaced rev-cur.");
  });

  it("resolves an unknown outcome from the recorded operation without resending it", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/revisions")) return json({ revisions: revisionHistory() });
      if (url.includes("/operations/")) {
        return json({ operation: { kind: "knowledge.rollback", response: rollbackRevision() } });
      }
      if (init?.method === "POST") { posts += 1; throw new TypeError("network down"); }
      return json({ knowledge: knowledgePayload() });
    });
    await mount();
    await click('[data-knowledge-rollback-target="rev-prev"]');
    await click("[data-knowledge-confirm-rollback]");
    expect(posts).toBe(1);
    expect(container.textContent).toContain("The outcome is unknown.");
    await click("[data-knowledge-resolve-operation]");
    expect(posts).toBe(1);
    expect(container.textContent).toContain("Rolled back: rev-prev is now the current revision; it replaced rev-cur.");
    // The record is cleared: there is nothing left to retry.
    expect(container.querySelector("[data-knowledge-retry-operation]")).toBeNull();
  });

  it("loads older revisions with the server cursor and appends without duplicates", async () => {
    const historyRequests: string[] = [];
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/revisions")) {
        historyRequests.push(url);
        return url.includes("cursor=cursor-1")
          ? json({ revisions: [{ id: "rev-old", title: "Guide", visibility: "shared", publishedAt: "2026-07-01T00:00:00.000Z", isCurrent: false }] })
          : json({ revisions: revisionHistory(), nextCursor: "cursor-1" });
      }
      return json({ knowledge: knowledgePayload() });
    });
    await mount();
    expect(container.querySelectorAll("[data-knowledge-history-row]")).toHaveLength(2);
    await click("[data-knowledge-history-more]");
    expect(historyRequests.some((url) => url.includes("cursor=cursor-1"))).toBe(true);
    const rows = [...container.querySelectorAll("[data-knowledge-history-row]")].map((row) => row.getAttribute("data-knowledge-history-row"));
    expect(rows).toEqual(["rev-cur", "rev-prev", "rev-old"]);
    // The server said there is no further page.
    expect(container.querySelector("[data-knowledge-history-more]")).toBeNull();
  });

  it("reports a stale state conflict as a refusal and never as a success", async () => {
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/revisions")) return json({ revisions: revisionHistory() });
      if (init?.method === "POST") return json({ error: { code: "ROLLBACK_STATE_CONFLICT", message: "stale", retryable: false } }, 409);
      return json({ knowledge: knowledgePayload() });
    });
    await mount();
    await click('[data-knowledge-rollback-target="rev-prev"]');
    await click("[data-knowledge-confirm-rollback]");
    expect(container.textContent).toContain("The server refused this change.");
    expect(container.textContent).not.toContain("Rolled back");
    expect(container.textContent).not.toContain("Moved to the recycle bin");
    // The 409 stays a state conflict, distinct from an unknown outcome the page would retry.
    expect(knowledgeItemWriteOutcome(new ApiRequestError("ROLLBACK_STATE_CONFLICT", "stale", 409, false))).toEqual({ kind: "state-conflict", code: "ROLLBACK_STATE_CONFLICT" });
    expect(knowledgeItemWriteOutcome(new ApiRequestError("KNOWLEDGE_OPERATION_CONFLICT", "reused", 409, false))).toEqual({ kind: "operation-conflict", code: "KNOWLEDGE_OPERATION_CONFLICT" });
  });
});

function rollbackRevision() {
  return {
    id: "rev-prev", knowledgeItemId: "knowledge-1", sourceVersionId: "src-1", title: "Guide", tagIds: [],
    visibility: "shared", publishedBy: "member-1", publishedAt: "2026-08-01T00:00:00.000Z",
    searchStatus: "indexed", previousRevisionId: "rev-cur",
  };
}

function knowledgePayload() {
  return {
    id: "knowledge-1", spaceId: "space-1", collectionId: null, title: "Guide", tagIds: ["tag-1"],
    visibility: "shared", searchStatus: "indexed",
    publishedAt: "2026-08-02T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", status: "active",
    currentRevision: {
      id: "rev-cur", knowledgeItemId: "knowledge-1", title: "Guide", visibility: "shared",
      publishedAt: "2026-08-02T00:00:00.000Z", isCurrent: true, previousRevisionId: "rev-prev", indexStatus: "indexed",
    },
  };
}

function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
