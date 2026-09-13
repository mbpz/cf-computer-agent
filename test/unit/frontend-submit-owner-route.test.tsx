// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { SubmitRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { loadOfflineSubmissionDraft, saveOfflineSubmissionDraft } from "../../frontend/lib/offline-submission-draft";
import { loadSubmissionIntent } from "../../frontend/lib/submission-intent";
import { mountApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { createMaturityRouteFetch } from "../helpers/workbench-maturity-route-fixtures";

describe("submission owner lifecycle", () => {
  let journey: MountedApp | undefined;
  afterEach(async () => { await flush(); await journey?.unmount(); journey = undefined; });
  const a = { mode: "markdown", title: "A", content: "private A" } as const;
  const b = { mode: "text", title: "B", content: "private B" } as const;

  async function openOwner(post: typeof fetch = async () => Response.json({ submission: { id: "submission-a" } })) {
    const fallback = createMaturityRouteFetch({ routeId: "submit", state: "ready", role: "contributor", permissionMask: "0x0" });
    journey = await mountApp({
      url: "https://app.test/submit",
      configureBrowser(browser) {
        saveOfflineSubmissionDraft("member-a", a, browser.localStorage);
        saveOfflineSubmissionDraft("member-b", b, browser.localStorage);
      },
      fetch: (input, init) => {
        if (String(input) === "/api/session") return Promise.resolve(Response.json({
          member: { id: "member-a", email: "a@app.test", role: "contributor" },
          capabilities: ["knowledge:read", "submission:create", "submission:read-own"],
          permissionMask: "0x0", logoutUrl: "/auth/logout",
        }));
        if (String(input) === "/api/submissions" && init?.method === "POST") return post(input, init);
        return fallback(input, init);
      },
    });
    await waitForApp(() => journey!.container.querySelector("#submission-content") !== null);
    return journey;
  }

  async function renderOwner(memberId: string) {
    await act(async () => { journey!.root.render(<SubmitRoute locale={createLocaleRuntime()} memberId={memberId} />); });
  }

  async function submit() {
    await act(async () => {
      journey!.container.querySelector("form")!.dispatchEvent(new journey!.browser.Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();
  }

  async function flush() {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }

  function content() { return (journey!.container.querySelector("#submission-content") as HTMLTextAreaElement).value; }

  it("persists the snapshot before POST and never exposes another member's pending submission", async () => {
    const attempts: string[] = [];
    const mounted = await openOwner(async (_input, init) => {
      const owner = attempts.length === 0 ? "member-a" : "member-b";
      const stored = loadSubmissionIntent(owner, journey!.browser.localStorage);
      expect(stored.kind).toBe("ready");
      if (stored.kind === "ready") expect(stored.intent.key).toBe(new Headers(init?.headers).get("idempotency-key"));
      attempts.push(String(init?.body));
      throw new Error("unknown outcome");
    });
    await submit();
    const original = loadSubmissionIntent("member-a", mounted.browser.localStorage);
    await renderOwner("member-b");
    expect(mounted.container.querySelector("[data-submission-retry]")).toBeNull();
    expect(content()).toBe("private B");
    await submit();
    expect(loadSubmissionIntent("member-a", mounted.browser.localStorage)).toEqual(original);
    await renderOwner("member-a");
    expect(mounted.container.querySelector("[data-submission-retry]")).not.toBeNull();
    expect(content()).toBe("private A");
    expect(attempts).toHaveLength(2);
  });

  it("preserves corrupt identities and blocks a replacement POST after remount", async () => {
    let calls = 0;
    const mounted = await openOwner(async () => { calls++; return Response.json({ submission: { id: "unexpected" } }); });
    const key = "personal-workbench:submission-intent:v1:member-a";
    mounted.browser.localStorage.setItem(key, "{invalid");
    await act(async () => { mounted.root.render(<p>Other page</p>); });
    await renderOwner("member-a");
    await submit();
    expect(calls).toBe(0);
    expect((mounted.container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect(mounted.browser.localStorage.getItem(key)).toBe("{invalid");
    expect(content()).toBe("private A");
  });

  it("reuses the exact request after a failed submit and route remount without automatic replay", async () => {
    const attempts: { key: string | null; body: string }[] = [];
    const mounted = await openOwner(async (_input, init) => {
      attempts.push({ key: new Headers(init?.headers).get("idempotency-key"), body: String(init?.body) });
      if (attempts.length === 1) throw new Error("response lost after commit");
      return Response.json({ submission: { id: "submission-a" } });
    });
    await submit();
    await act(async () => { mounted.root.render(<p>Other page</p>); });
    await renderOwner("member-a");
    expect(attempts).toHaveLength(1);
    await submit();
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(content()).toBe("");
  });

  it("resets the rendered form when the same route changes member and restores A on return", async () => {
    const mounted = await openOwner();
    await renderOwner("member-a");
    expect(content()).toBe("private A");
    await renderOwner("member-b");
    expect(content()).toBe("private B");
    expect(loadOfflineSubmissionDraft("member-b", mounted.browser.localStorage)).toEqual(b);
    await renderOwner("member-a");
    expect(content()).toBe("private A");
  });

  it("retries the original snapshot after edits and gives the edited submission a fresh identity only after success", async () => {
    const attempts: { key: string | null; body: string }[] = [];
    const mounted = await openOwner(async (_input, init) => {
      attempts.push({ key: new Headers(init?.headers).get("idempotency-key"), body: String(init?.body) });
      if (attempts.length === 1) throw new Error("timeout");
      return Response.json({ submission: { id: `submission-${attempts.length}` } });
    });
    await submit();
    await act(async () => {
      const mode = mounted.container.querySelector("#submission-mode") as HTMLSelectElement;
      mode.value = "code"; mode.dispatchEvent(new mounted.browser.Event("change", { bubbles: true }));
    });
    expect((mounted.container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { (mounted.container.querySelector('[data-submission-retry]') as HTMLButtonElement).click(); });
    await flush();
    expect(attempts[1]).toEqual(attempts[0]);
    expect(content()).toBe("private A");
    await submit();
    expect(attempts[2].key).not.toBe(attempts[0].key);
    expect(JSON.parse(attempts[2].body).kind).toBe("code");
  });

  it("warns when persistence fails but reuses the in-memory key on retry", async () => {
    const keys: (string | null)[] = [];
    const mounted = await openOwner(async (_input, init) => { keys.push(new Headers(init?.headers).get("idempotency-key")); throw new Error("offline"); });
    Object.defineProperty(mounted.browser, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    await submit();
    expect(mounted.container.querySelector('[data-submission-storage-warning]')).not.toBeNull();
    await submit();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it("keeps the pending key on an idempotency conflict instead of silently issuing a new request", async () => {
    const keys: (string | null)[] = [];
    const mounted = await openOwner(async (_input, init) => {
      keys.push(new Headers(init?.headers).get("idempotency-key"));
      return Response.json({ error: { code: "IDEMPOTENCY_CONFLICT", message: "conflict", retryable: false } }, { status: 409 });
    });
    await submit(); await submit();
    expect(keys[1]).toBe(keys[0]);
    expect(content()).toBe("private A");
    expect(mounted.container.querySelector('[data-submission-retry]')).not.toBeNull();
  });

  it.each(["success", "failure"] as const)("ignores a late %s after changing owners and cancels the old request", async (outcome) => {
    let resolve!: (response: Response) => void;
    let reject!: (error: Error) => void;
    let signal: AbortSignal | null | undefined;
    const pending = new Promise<Response>((done, fail) => { resolve = done; reject = fail; });
    const mounted = await openOwner(async (_input, init) => { signal = init?.signal; return pending; });
    await renderOwner("member-a");
    await submit();
    await renderOwner("member-b");
    await act(async () => {
      if (outcome === "success") resolve(Response.json({ submission: { id: "submission-a" } }));
      else reject(new Error("late network failure"));
    });
    await flush();
    expect(content()).toBe("private B");
    expect(mounted.container.querySelector('[role="alert"]')).toBeNull();
    expect(loadOfflineSubmissionDraft("member-b", mounted.browser.localStorage)).toEqual(b);
    expect(loadOfflineSubmissionDraft("member-a", mounted.browser.localStorage)).toEqual(a);
    expect(signal?.aborted).toBe(true);
  });

  it("clears only the submitting member on success", async () => {
    const mounted = await openOwner();
    await submit();
    expect(content()).toBe("");
    expect(loadOfflineSubmissionDraft("member-a", mounted.browser.localStorage)).toBeNull();
    expect(loadOfflineSubmissionDraft("member-b", mounted.browser.localStorage)).toEqual(b);
    expect(mounted.container.querySelector('[data-page-state="empty"]')).not.toBeNull();
  });

  it("keeps the owner draft and shows a visible error after a failed submit", async () => {
    const mounted = await openOwner(async () => { throw new Error("offline"); });
    await submit();
    expect(content()).toBe("private A");
    expect(mounted.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(loadOfflineSubmissionDraft("member-a", mounted.browser.localStorage)).toEqual(a);
    expect(loadOfflineSubmissionDraft("member-b", mounted.browser.localStorage)).toEqual(b);
  });

  it("allows a manual retry after failure without automatically sending again", async () => {
    let calls = 0;
    const mounted = await openOwner(async () => {
      calls += 1;
      if (calls === 1) throw new Error("offline");
      return Response.json({ submission: { id: "submission-a" } });
    });
    await submit();
    expect(calls).toBe(1);
    expect(content()).toBe("private A");
    await submit();
    await waitForApp(() => content() === "");
    expect(calls).toBe(2);
    expect(loadOfflineSubmissionDraft("member-b", mounted.browser.localStorage)).toEqual(b);
  });

  it("restores the member draft after unmounting and remounting the route", async () => {
    const mounted = await openOwner();
    await act(async () => { mounted.root.render(<p>Other page</p>); });
    await renderOwner("member-a");
    expect(content()).toBe("private A");
    expect(loadOfflineSubmissionDraft("member-b", mounted.browser.localStorage)).toEqual(b);
  });

  it("continues editing and submitting when storage becomes unavailable", async () => {
    const mounted = await openOwner();
    Object.defineProperty(mounted.browser, "localStorage", { configurable: true, get() { throw new Error("storage blocked"); } });
    await act(async () => {
      const mode = mounted.container.querySelector("#submission-mode") as HTMLSelectElement;
      mode.value = "code";
      mode.dispatchEvent(new mounted.browser.Event("change", { bubbles: true }));
    });
    expect(content()).toBe("private A");
    await submit();
    await waitForApp(() => content() === "");
    expect(mounted.container.querySelector('[data-page-state="empty"]')).not.toBeNull();
  });

  it("does not clear saved edits if a response arrives after the route was left", async () => {
    let resolve!: (response: Response) => void;
    let signal: AbortSignal | null | undefined;
    const pending = new Promise<Response>((done) => { resolve = done; });
    const mounted = await openOwner(async (_input, init) => { signal = init?.signal; return pending; });
    await submit();
    await act(async () => { mounted.root.render(<p>Other page</p>); });
    await act(async () => { resolve(Response.json({ submission: { id: "submission-a" } })); });
    await flush();
    expect(mounted.container.textContent).toBe("Other page");
    expect(loadOfflineSubmissionDraft("member-a", mounted.browser.localStorage)).toEqual(a);
    expect(signal?.aborted).toBe(true);
  });

  it("keeps new edits made while the old draft is being submitted", async () => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((done) => { resolve = done; });
    const mounted = await openOwner(async () => pending);
    await submit();
    await act(async () => {
      const mode = mounted.container.querySelector("#submission-mode") as HTMLSelectElement;
      mode.value = "code";
      mode.dispatchEvent(new mounted.browser.Event("change", { bubbles: true }));
    });
    expect(loadOfflineSubmissionDraft("member-a", mounted.browser.localStorage)).toEqual({ ...a, mode: "code" });
    await act(async () => { resolve(Response.json({ submission: { id: "submission-a" } })); });
    await flush();
    expect(content()).toBe("private A");
    expect(loadOfflineSubmissionDraft("member-a", mounted.browser.localStorage)).toEqual({ ...a, mode: "code" });
  });

  it("admits at most one in-flight submission from synchronous duplicate form events", async () => {
    let resolve!: (response: Response) => void;
    let calls = 0;
    const pending = new Promise<Response>((done) => { resolve = done; });
    const mounted = await openOwner(async () => { calls += 1; return pending; });
    await act(async () => {
      const form = mounted.container.querySelector("form")!;
      form.dispatchEvent(new mounted.browser.Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new mounted.browser.Event("submit", { bubbles: true, cancelable: true }));
    });
    await act(async () => { resolve(Response.json({ submission: { id: "submission-a" } })); });
    await flush();
    expect(calls).toBe(1);
    expect(content()).toBe("");
  });

  it("restores the session member draft without showing the legacy unowned draft", async () => {
    const fallback = createMaturityRouteFetch({ routeId: "submit", state: "ready", role: "contributor", permissionMask: "0x0" });
    journey = await mountApp({
      url: "https://app.test/submit",
      configureBrowser(browser) {
        browser.localStorage.setItem("memory-garden:offline-submission-draft:v1", JSON.stringify({ mode: "text", title: "Old", content: "unknown owner" }));
        browser.localStorage.setItem("personal-workbench:offline-submission-draft:v2:member-b", JSON.stringify({ mode: "text", title: "B", content: "private B" }));
      },
      fetch: (input, init) => String(input) === "/api/session"
        ? Promise.resolve(Response.json({
          member: { id: "member-b", email: "b@app.test", role: "contributor" },
          capabilities: ["knowledge:read", "submission:create", "submission:read-own"],
          permissionMask: "0x0", logoutUrl: "/auth/logout",
        }))
        : fallback(input, init),
    });
    await waitForApp(() => journey!.container.querySelector("#submission-content") !== null);
    expect((journey.container.querySelector("#submission-content") as HTMLTextAreaElement).value).toBe("private B");
    expect(journey.container.textContent).not.toContain("unknown owner");
  });
});
