// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewDetailRoute } from "../../frontend/pages/admin/review-detail-route";
import { normalizeReviewPreview, reviewPublishPayload } from "../../frontend/components/review/review-detail-data";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import type { Fetcher } from "../../frontend/lib/api";
import { chooseValue, settle } from "./helpers/listbox";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const space = (id: string) => ({ id, slug: id, name: id.toUpperCase(), kind: "shared", status: "active", readOnly: false, position: 0 });
const tag = (id: string, spaceId = "default") => ({ id, spaceId, slug: id, name: `Tag ${id}`, status: "active" });

function previewPayload(options: { visibility?: "shared" | "admin_only"; tagIds?: readonly string[]; title?: string; status?: string } = {}) {
  const { visibility = "shared", tagIds = [], title = "Title sub-1", status = "review_pending" } = options;
  return {
    preview: {
      submissionId: "sub-1", submitterId: "member-1", status,
      requestedSpaceId: "default", requestedVisibility: visibility, requestedCollectionId: null,
      tagIds: [...tagIds], title, rawContent: "Content sub-1",
      sourceVersion: { id: "version-1", content: "Content sub-1", kind: "markdown", parserVersion: "m1" },
      safety: { status: "safe", findings: [] }, chunks: [],
    },
  };
}
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
const preview = (options: Parameters<typeof previewPayload>[0] = {}) => json(previewPayload(options));

/** Answers the option reads the metadata form makes, then hands detail/decision traffic to the suite. */
function withOptions(handler: Fetcher, config: { tags?: Record<string, readonly unknown[]>; collections?: Record<string, readonly unknown[]>; spacesError?: boolean } = {}): Fetcher {
  return (input, init) => {
    const url = String(input);
    if (url.endsWith("/comments")) return Promise.resolve(json({ comments: [] }));
    const collections = /^\/api\/spaces\/([^/]+)\/collections/u.exec(url);
    if (collections) return Promise.resolve(json({ items: config.collections?.[decodeURIComponent(collections[1]!)] ?? [] }));
    if (url.startsWith("/api/spaces")) return Promise.resolve(config.spacesError ? new Response(null, { status: 500 }) : json({ items: [space("default"), space("space-2")] }));
    if (url.startsWith("/api/admin/tags")) {
      const spaceId = new URL(url, "https://app.test").searchParams.get("spaceId") ?? "default";
      return Promise.resolve(json({ items: config.tags?.[spaceId] ?? [] }));
    }
    return handler(input, init);
  };
}

describe("review publication metadata editing", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/submissions/sub-1" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement);
    vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  async function renderMember(requester: Fetcher) {
    await act(async () => root.render(<ReviewDetailRoute id="sub-1" memberId="member-a" locale={locale} requester={requester} />));
    await flush();
    // The form mounts after the detail read seeds the editable draft, then loads
    // spaces, collections and tags; give those state commits a full round.
    await settle();
    await flush();
  }
  function button(label: string) {
    // Confirmations render through the dialog portal on document.body.
    const found = [...document.querySelectorAll("button")].find((item) => item.textContent === label) as HTMLButtonElement | undefined;
    expect(found).toBeTruthy(); return found!;
  }
  function checkbox(selector: string) {
    const found = container.querySelector(`${selector} [role="checkbox"]`) as HTMLButtonElement | null;
    expect(found).toBeTruthy(); return found!;
  }
  async function typeTitle(value: string) {
    const input = container.querySelector("[data-review-metadata-title]") as HTMLInputElement | null;
    expect(input).toBeTruthy();
    await act(async () => {
      Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input!.dispatchEvent(new browser.Event("input", { bubbles: true }));
    });
  }
  async function publish() {
    await act(async () => button("Publish").click());
    await act(async () => button("Submit decision").click());
    await flush();
  }
  async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }

  it("publishes the edited metadata instead of the preview defaults, without a reason code", async () => {
    const posts: string[] = [];
    await renderMember(withOptions(async (_input, init) => {
      if (init?.method === "POST") {
        posts.push(String(init.body));
        return json({ revision: { id: "rev-1", knowledgeItemId: "ki-1", searchStatus: "indexed" } });
      }
      return preview({ tagIds: ["tag-1"] });
    }, { tags: { default: [tag("tag-1"), tag("tag-2")] } }));

    expect(container.querySelector("[data-review-metadata-title]")).not.toBeNull();
    expect(checkbox('[data-review-tag="tag-1"]').getAttribute("aria-checked")).toBe("true");
    await typeTitle("  Edited title  ");
    await act(async () => checkbox('[data-review-tag="tag-2"]').click());
    expect(checkbox('[data-review-tag="tag-2"]').getAttribute("aria-checked")).toBe("true");
    await publish();

    expect(posts).toHaveLength(1);
    const body = JSON.parse(posts[0]!);
    expect(body).toMatchObject({
      title: "  Edited title  ", visibility: "shared", spaceId: "default", collectionId: null, tagIds: ["tag-1", "tag-2"],
    });
    expect(body).not.toHaveProperty("visibilityReasonCode");
    expect(container.textContent).toContain("Published and searchable.");
  });

  it("blocks publish until an admin_only request is explicitly expanded to shared", async () => {
    const posts: string[] = [];
    await renderMember(withOptions(async (_input, init) => {
      if (init?.method === "POST") {
        posts.push(String(init.body));
        return json({ revision: { id: "rev-1", knowledgeItemId: "ki-1", searchStatus: "indexed" } });
      }
      return preview({ visibility: "admin_only" });
    }));

    const visibility = container.querySelector("[data-review-metadata-visibility]");
    expect(visibility).not.toBeNull();
    expect(container.querySelector("[data-review-visibility-expansion]")).toBeNull();
    await act(async () => chooseValue(visibility, "shared"));

    const expansion = container.querySelector("[data-review-visibility-expansion]");
    expect(expansion).not.toBeNull();
    expect(checkbox("[data-review-visibility-expansion]").getAttribute("aria-checked")).toBe("false");
    expect(button("Publish").disabled).toBe(true);
    // A blocked publish never opens its confirmation, so nothing can be sent.
    await act(async () => button("Publish").click());
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();

    await act(async () => checkbox("[data-review-visibility-expansion]").click());
    expect(checkbox("[data-review-visibility-expansion]").getAttribute("aria-checked")).toBe("true");
    expect(button("Publish").disabled).toBe(false);
    await publish();

    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0]!)).toMatchObject({
      visibility: "shared", visibilityReasonCode: "admin_visibility_expansion", spaceId: "default",
    });
  });

  it("replays the frozen edited publish body after an unknown result", async () => {
    const posts: string[] = [];
    await renderMember(withOptions(async (_input, init) => {
      if (init?.method === "POST") { posts.push(String(init.body)); return new Response(null, { status: 503 }); }
      return preview({ visibility: "admin_only" });
    }));

    await typeTitle("Expanded title");
    await act(async () => chooseValue(container.querySelector("[data-review-metadata-visibility]"), "shared"));
    await act(async () => checkbox("[data-review-visibility-expansion]").click());
    await publish();

    expect(posts).toHaveLength(1);
    const first = posts[0]!;
    expect(JSON.parse(first)).toMatchObject({
      title: "Expanded title", visibility: "shared", visibilityReasonCode: "admin_visibility_expansion",
    });
    expect(container.textContent).toContain("The result is unknown");

    await act(async () => button("Retry same decision").click());
    await flush();
    expect(posts).toHaveLength(2);
    expect(posts[1]).toBe(first);
  });

  it("keeps the page header and reports option read failures in place", async () => {
    await renderMember(withOptions(async (_input, init) => init?.method === "POST" ? json({}) : preview(), { spacesError: true }));
    expect(container.querySelector("h1")?.textContent).toBe("Title sub-1");
    const error = container.querySelector("[data-review-metadata-spaces-error]");
    expect(error).not.toBeNull();
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent).toContain("Unable to load spaces.");
    expect(button("Reload options")).toBeTruthy();
    // The decision surface is still present; only the option-dependent publish gate is unavailable.
    expect(button("Reject")).toBeTruthy();
  });

  it("does not mount the metadata form for a submission past review", async () => {
    await renderMember(withOptions(async () => preview({ status: "rejected" })));
    expect(container.querySelector("[data-review-publish-metadata]")).toBeNull();
    expect(container.querySelector('[data-review-state="closed"]')).not.toBeNull();
  });

  it("keeps the requested visibility beside the editable payload and adds the reason code only for an expansion", () => {
    const data = normalizeReviewPreview(previewPayload({ visibility: "admin_only", tagIds: ["tag-1"] }).preview);
    expect(data).not.toBeNull();
    expect(data!.requestedVisibility).toBe("admin_only");
    expect(data!.publish).toMatchObject({ visibility: "admin_only", tagIds: ["tag-1"] });
    expect(reviewPublishPayload("shared", data!.publish)).not.toHaveProperty("visibilityReasonCode");
    expect(reviewPublishPayload("admin_only", { ...data!.publish, visibility: "shared" })).toMatchObject({
      visibility: "shared", visibilityReasonCode: "admin_visibility_expansion",
    });
    expect(reviewPublishPayload("admin_only", data!.publish)).not.toHaveProperty("visibilityReasonCode");
  });
});
