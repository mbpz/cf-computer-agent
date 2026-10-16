// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Fetcher } from "../../frontend/lib/api";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { isSubmittableSpace, loadSpaceCollections, loadSubmissionSpaces, useSubmissionTargets, type MemberSpace, type SubmissionTargetsView } from "../../frontend/lib/submission-targets-data";
import { SubmissionTargetPicker } from "../../frontend/components/submissions/submission-target-picker";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));

// happy-dom evaluates its own node:vm script while loading, so it must be imported after the vm mocks are installed.
const { Window } = await import("happy-dom");

const language = createLocaleRuntime({ navigatorLanguage: "en" });

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

function memberSpace(id: string, overrides: Partial<MemberSpace> = {}): MemberSpace {
  return { id, slug: id, name: id, kind: "shared", status: "active", readOnly: false, position: 0, ...overrides };
}

const errorResponse = () => new Response(JSON.stringify({ error: { code: "SPACE_ERROR", message: "boom", retryable: true } }), { status: 500, headers: { "content-type": "application/json" } });

/** Routes the two member reads by path, proving the hook follows the exact cursors the server returns. */
function buildRequester(spec: { spaces: (cursor: string) => Response; collections?: (spaceId: string, cursor: string) => Response }): Fetcher {
  return async (input) => {
    const url = new URL(String(input), "https://app.test");
    const cursor = url.searchParams.get("cursor") ?? "";
    if (url.pathname === "/api/spaces") return spec.spaces(cursor);
    const match = /^\/api\/spaces\/([^/]+)\/collections$/.exec(url.pathname);
    if (match) return spec.collections ? spec.collections(decodeURIComponent(match[1]!), cursor) : Response.json({ items: [] });
    return errorResponse();
  };
}

interface Capture { current: SubmissionTargetsView | null; }

function Harness({ requester, capture, initial }: { requester: Fetcher; capture: Capture; initial?: SubmissionTargetsView["target"] }) {
  const { view, actions } = useSubmissionTargets({ requester, initial });
  capture.current = view;
  return <SubmissionTargetPicker locale={language} view={view} actions={actions} />;
}

describe("member submission targets", () => {
  it("flags only spaces the repository insert guard accepts", () => {
    expect(isSubmittableSpace(memberSpace("a"))).toBe(true);
    expect(isSubmittableSpace(memberSpace("b", { kind: "legacy", readOnly: true }))).toBe(false);
    expect(isSubmittableSpace(memberSpace("c", { readOnly: true }))).toBe(false);
    expect(isSubmittableSpace(memberSpace("d", { status: "disabled" }))).toBe(false);
  });

  it("rejects malformed pages instead of fabricating options", async () => {
    const requester = async () => Response.json({ items: [memberSpace("a", { readOnly: "yes" as unknown as boolean })] });
    await expect(loadSubmissionSpaces({ requester })).rejects.toThrow("SPACE_RESPONSE_INVALID");
    const overflow = async () => Response.json({ items: Array.from({ length: 51 }, (_, index) => memberSpace(`s${index}`)) });
    await expect(loadSubmissionSpaces({ requester: overflow })).rejects.toThrow("SPACE_RESPONSE_INVALID");
    const badCursor = async () => Response.json({ items: [memberSpace("a")], nextCursor: 7 });
    await expect(loadSubmissionSpaces({ requester: badCursor })).rejects.toThrow("SPACE_RESPONSE_INVALID");
    const mismatch = async () => Response.json({ items: [{ id: "c", spaceId: "other", parentId: null, name: "C", status: "active" }] });
    await expect(loadSpaceCollections("a", { requester: mismatch })).rejects.toThrow("SPACE_RESPONSE_INVALID");
  });

  describe("rendered picker", () => {
    let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
    beforeEach(() => {
      browser = new Window({ url: "https://app.test/submit" });
      vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
      root = createRoot(container);
    });
    afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

    async function waitFor(predicate: () => boolean) {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (predicate()) return;
        await act(async () => { await sleep(5); });
      }
      throw new Error("waitFor timeout");
    }
    async function mount(requester: Fetcher, initial?: SubmissionTargetsView["target"]) {
      const capture: Capture = { current: null };
      await act(async () => { root.render(<Harness requester={requester} capture={capture} initial={initial} />); });
      return capture;
    }
    function optionValues(selector: string) {
      return [...container.querySelectorAll<HTMLOptionElement>(`${selector} option`)].map((option) => option.value);
    }
    async function click(selector: string) {
      const element = container.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`missing ${selector}`);
      await act(async () => { element.click(); await sleep(0); });
    }
    async function changeSelect(selector: string, value: string) {
      const element = container.querySelector<HTMLSelectElement>(selector);
      if (!element) throw new Error(`missing ${selector}`);
      await act(async () => {
        element.value = value;
        element.dispatchEvent(new browser.Event("change", { bubbles: true }));
        await sleep(0);
      });
    }

    it("offers exactly the loaded submittable spaces and never selects a legacy/read-only/disabled one", async () => {
      const requester = buildRequester({ spaces: () => Response.json({ items: [memberSpace("alpha"), memberSpace("beta"), memberSpace("legacy", { kind: "legacy", readOnly: true }), memberSpace("frozen", { readOnly: true }), memberSpace("off", { status: "disabled" })] }) });
      const capture = await mount(requester);
      await waitFor(() => container.querySelector("[data-submission-target]")?.getAttribute("data-submission-target") === "ready");
      expect(optionValues("[data-submission-target-space]")).toEqual(["alpha", "beta"]);
      expect(container.querySelector("[data-submission-target-space]")?.getAttribute("value")).toBeNull();
      expect(capture.current?.spaceId).toBe("alpha");
      expect(capture.current?.target).toEqual({ requestedSpaceId: "alpha", requestedCollectionId: null, requestedVisibility: "shared" });
      for (const hidden of ["legacy", "frozen", "off"]) expect(optionValues("[data-submission-target-space]")).not.toContain(hidden);
    });

    it("renders the error state with no options, then recovers when the retry re-issues the request", async () => {
      let calls = 0;
      const requester: Fetcher = async (input) => {
        const url = new URL(String(input), "https://app.test");
        if (url.pathname !== "/api/spaces") return Response.json({ items: [] });
        calls += 1;
        return calls === 1 ? errorResponse() : Response.json({ items: [memberSpace("alpha")] });
      };
      const capture = await mount(requester);
      await waitFor(() => container.querySelector("[data-submission-target]")?.getAttribute("data-submission-target") === "error");
      expect(container.querySelector("[data-submission-target-retry]")).toBeTruthy();
      expect(optionValues("[data-submission-target-space]")).toEqual([]);
      expect(capture.current?.spaces).toEqual([]);
      expect(capture.current?.target).toBeNull();
      await click("[data-submission-target-retry]");
      await waitFor(() => container.querySelector("[data-submission-target]")?.getAttribute("data-submission-target") === "ready");
      expect(calls).toBe(2);
      expect(optionValues("[data-submission-target-space]")).toEqual(["alpha"]);
    });

    it("keeps the space selection through a failed collection load and recovers on the collection retry", async () => {
      let collectionsFail = true;
      const requester = buildRequester({
        spaces: () => Response.json({ items: [memberSpace("alpha")] }),
        collections: () => collectionsFail ? errorResponse() : Response.json({ items: [{ id: "guide", spaceId: "alpha", parentId: null, name: "Guide", status: "active" }] }),
      });
      const capture = await mount(requester);
      await waitFor(() => container.querySelector("[data-submission-target-collection-error]") !== null);
      expect(capture.current?.spaceId).toBe("alpha");
      expect(container.querySelector<HTMLSelectElement>("[data-submission-target-collection]")?.value).toBe("");
      expect(optionValues("[data-submission-target-collection]")).toEqual([""]);
      collectionsFail = false;
      await click("[data-submission-target-collection-retry]");
      await waitFor(() => optionValues("[data-submission-target-collection]").includes("guide"));
      expect(capture.current?.spaceId).toBe("alpha");
      expect(capture.current?.collections.kind).toBe("ready");
    });

    it("follows the cursor across pages and reports a further page through hasMore", async () => {
      const pages: Record<string, { items: MemberSpace[]; nextCursor?: string }> = {};
      for (let index = 0; index < 6; index += 1) pages[index === 0 ? "" : `c${index}`] = { items: [memberSpace(`s${index}`)], ...(index < 5 ? { nextCursor: `c${index + 1}` } : {}) };
      const requester = buildRequester({ spaces: (cursor) => Response.json(pages[cursor] ?? { items: [] }) });
      const capture = await mount(requester);
      await waitFor(() => container.querySelector("[data-submission-target-more-spaces]") !== null);
      expect(capture.current?.spaces.map((space) => space.id)).toEqual(["s0", "s1", "s2", "s3", "s4"]);
      expect(capture.current?.hasMoreSpaces).toBe(true);
      await click("[data-submission-target-more-spaces]");
      await waitFor(() => capture.current?.spaces.length === 6);
      expect(capture.current?.spaces.map((space) => space.id)).toEqual(["s0", "s1", "s2", "s3", "s4", "s5"]);
      expect(capture.current?.hasMoreSpaces).toBe(false);
      expect(container.querySelector("[data-submission-target-more-spaces]")).toBeNull();
    });

    it("keeps target null until a space resolves, then carries space, collection and visibility", async () => {
      const requester = buildRequester({
        spaces: () => Response.json({ items: [memberSpace("alpha")] }),
        collections: () => Response.json({ items: [{ id: "guide", spaceId: "alpha", parentId: null, name: "Guide", status: "active" }] }),
      });
      const capture: Capture = { current: null };
      await act(async () => { root.render(<Harness requester={requester} capture={capture} />); });
      expect(capture.current?.target).toBeNull();
      expect(container.querySelector("[data-submission-target]")?.getAttribute("data-submission-target")).toBe("loading");
      await waitFor(() => container.querySelector("[data-submission-target-collection]") !== null && optionValues("[data-submission-target-collection]").includes("guide"));
      expect(capture.current?.target).toEqual({ requestedSpaceId: "alpha", requestedCollectionId: null, requestedVisibility: "shared" });
      await changeSelect("[data-submission-target-collection]", "guide");
      expect(capture.current?.target).toEqual({ requestedSpaceId: "alpha", requestedCollectionId: "guide", requestedVisibility: "shared" });
      await changeSelect("[data-submission-target-visibility]", "admin_only");
      expect(capture.current?.target).toEqual({ requestedSpaceId: "alpha", requestedCollectionId: "guide", requestedVisibility: "admin_only" });
    });

    it("marks a stored target whose space is not in the loaded pages and falls back to a loaded one", async () => {
      const requester = buildRequester({ spaces: () => Response.json({ items: [memberSpace("alpha")] }) });
      const capture = await mount(requester, { requestedSpaceId: "gone", requestedCollectionId: null, requestedVisibility: "admin_only" });
      await waitFor(() => container.querySelector("[data-submission-target]")?.getAttribute("data-submission-target") === "ready");
      expect(capture.current?.storedTargetMissing).toBe(true);
      expect(container.querySelector("[data-submission-target-stored-missing]")).toBeTruthy();
      expect(capture.current?.spaceId).toBe("alpha");
      expect(capture.current?.visibility).toBe("shared");
    });
  });
});
