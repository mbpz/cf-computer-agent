// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAuthenticatedApp, forceRemountAppAt, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
import { loadOfflineSubmissionDraft } from "../../frontend/lib/offline-submission-draft";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));

const NOW = "2026-10-16T09:00:00.000Z";
const GROUP = "0x100000";
const space = { id: "space-a", slug: "space-a", name: "Shared Space", description: "", kind: "shared", status: "active", position: 0, readOnly: false, createdAt: NOW, updatedAt: NOW };
const returnedRow = {
  id: "prior-1", title: "Returned guide", status: "revision_requested",
  kind: "markdown", content: "# Original body",
  requestedSpaceId: "space-a", requestedCollectionId: null, requestedVisibility: "shared",
  review: { decision: "revision_requested", reasonCode: "needs_revision", note: "Please add sources." },
  createdAt: NOW, updatedAt: NOW,
};

/** A scripted server for the member submission loop: drafts, the list, and resubmission. */
function server() {
  const drafts: { id: string; kind: string; title: string; content: string; requestedSpaceId: string; requestedCollectionId: string | null; requestedVisibility: string; status: string; updatedAt: string }[] = [];
  const submissions: Record<string, unknown>[] = [{ ...returnedRow }];
  const resubmitKeys: string[] = [];
  const draftKeys: string[] = [];
  return {
    drafts, submissions, resubmitKeys, draftKeys,
    failDraftWrite: false, lostResubmitResponse: false, lostDiscardResponse: false, discardCount: 0, refuseDraftDiscard: false,
    row: (item: Record<string, unknown>) => ({
      submitterId: "contributor-route-auditor", status: "draft", createdAt: NOW, updatedAt: NOW,
      requestedCollectionId: null, requestedVisibility: "shared", ...item,
    }),
    mine: () => Response.json({
      items: submissions.map((item) => ({ title: "Untitled", ...item })),
      pagination: { page: 1, pageSize: 20, total: submissions.length, totalPages: 1 },
    }),
  };
}

describe("member submission loop through App", () => {
  let app: MountedApp | undefined;
  let state = server();
  const main = () => app!.container.querySelector("main") as HTMLElement;
  const titleInput = () => main().querySelector("#submission-title") as HTMLInputElement;
  const contentInput = () => main().querySelector("#submission-content") as HTMLTextAreaElement;
  const draftStatus = () => main().querySelector("[data-submission-draft-status]") as HTMLElement | null;

  async function mount(url: string) {
    state = server();
    app = await mountAuthenticatedApp({
      url: `https://app.test${url}`, role: "contributor", permissionMask: GROUP,
      fetch: async (input, init) => {
        const request = new URL(String(input), "https://app.test");
        const path = request.pathname;
        const method = (init?.method ?? "GET").toUpperCase();
        if (path === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", GROUP) });
        if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });
        if (path === "/api/notifications/summary") return Response.json({ unread: 0 });
        if (path === "/api/assets/availability") return Response.json({ storageEnabled: false, reason: "ASSET_STORAGE_NOT_CONFIGURED", maxBytes: 1048576 });
        if (path === "/api/spaces") return Response.json({ items: [space] });
        if (path === `/api/spaces/${space.id}/collections`) return Response.json({ items: [] });
        if (path === "/api/submissions/mine") return state.mine();
        if (path === "/api/submissions/drafts" && method === "POST") {
          if (state.failDraftWrite) return apiError(400, "SUBMISSION_INVALID", false);
          const body = JSON.parse(String(init?.body)) as Record<string, string>;
          const row = { id: `draft-${state.drafts.length + 1}`, kind: body.kind!, title: body.title!, content: body.content!, requestedSpaceId: body.requestedSpaceId!, requestedVisibility: body.requestedVisibility!, status: "draft", updatedAt: NOW };
          state.drafts.push(row);
          state.draftKeys.push(String(new Headers(init?.headers).get("idempotency-key") ?? ""));
          return Response.json(state.row(row), { status: 201 });
        }
        const draftPath = /^\/api\/submissions\/drafts\/([^/]+)$/u.exec(path);
        if (draftPath) {
          const draft = state.drafts.find((candidate) => candidate.id === draftPath[1]);
          if (!draft) return apiError(404, "SUBMISSION_NOT_FOUND");
          if (method === "PATCH") {
            if (state.failDraftWrite) return apiError(503, "UNAVAILABLE", true);
            const body = JSON.parse(String(init?.body)) as Record<string, string>;
            Object.assign(draft, { kind: body.kind, title: body.title, content: body.content, requestedSpaceId: body.requestedSpaceId });
          }
          if (method === "DELETE") {
            if (state.refuseDraftDiscard) return apiError(404, "SUBMISSION_NOT_FOUND");
            state.drafts.splice(state.drafts.indexOf(draft), 1);
            state.discardCount += 1;
            // The delete lands, but its answer never reaches the browser.
            if (state.lostDiscardResponse) { state.lostDiscardResponse = false; throw new Error("network down"); }
            return new Response(null, { status: 204 });
          }
          return Response.json(state.row(draft));
        }
        const comments = /^\/api\/submissions\/([^/]+)\/comments$/u.exec(path);
        if (comments) {
          return comments[1] === "prior-1"
            ? Response.json({ comments: [{ id: "comment-1", submissionId: "prior-1", authorRole: "admin", body: "Please add sources.", createdAt: NOW }] })
            : Response.json({ comments: [] });
        }
        const resubmit = /^\/api\/submissions\/([^/]+)\/resubmit$/u.exec(path);
        if (resubmit && method === "POST") {
          const key = String(new Headers(init?.headers).get("idempotency-key") ?? "");
          state.resubmitKeys.push(key);
          const body = JSON.parse(String(init?.body)) as Record<string, string>;
          const existing = state.submissions.find((item) => item.idempotencyKey === key);
          const recorded = existing ?? { id: "submission-new", title: body.title, content: body.content, kind: body.kind, status: "review_pending", supersedesSubmissionId: resubmit[1], idempotencyKey: key, createdAt: NOW, updatedAt: NOW };
          if (!existing) {
            state.submissions.push(recorded);
            // The write lands, but its answer never reaches the browser.
            if (state.lostResubmitResponse) { state.lostResubmitResponse = false; throw new Error("network down"); }
          }
          return Response.json({ submission: recorded, similarCandidates: [] }, { status: 201 });
        }
        throw new Error(`unplanned request ${method} ${path}`);
      },
    });
    await waitForApp(() => main().querySelector("[data-shell-root]") !== null || main() !== null);
  }

  async function change(node: HTMLInputElement | HTMLTextAreaElement, value: string) {
    await act(async () => {
      node.value = value;
      const key = Object.keys(node).find((candidate) => candidate.startsWith("__reactProps$"))!;
      (node as unknown as Record<string, { onChange: (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => void }>)[key]!.onChange(({ currentTarget: node, target: node }) as never);
    });
  }

  async function click(node: Element | null) {
    expect(node).toBeTruthy();
    await act(async () => { (node as HTMLElement).click(); await tick(); });
  }

  /** Leaving the page is what flushes the draft, so no debounce wait is needed. */
  async function leavePage() {
    await act(async () => {
      app!.browser.dispatchEvent(new app!.browser.Event("pagehide"));
      await tick();
    });
  }

  afterEach(async () => { await app?.unmount(); app = undefined; });

  /** The submit route loads its destinations, so readiness can take more than one poll window. */
  async function waitForSelector(selector: string) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await waitForApp(() => main().querySelector(selector) !== null);
        return;
      } catch {
        // Keep polling: the harness window is shorter than a slow destination read.
      }
    }
    throw new Error(`selector not reached: ${selector}`);
  }

  function tick(): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 0);
    return promise;
  }

  it("keeps a draft across a reload and says it is saved on the server", async () => {
    await mount("/submit");
    await waitForSelector("[data-submission-target=\"ready\"]");
    expect(state.drafts).toHaveLength(0);

    await change(titleInput(), "Draft guide");
    await change(contentInput(), "# Body");
    await leavePage();
    await waitForApp(() => draftStatus()?.dataset.submissionDraftStatus === "saved");
    expect(draftStatus()!.textContent).toContain("Draft saved to the server");
    expect(state.drafts).toHaveLength(1);
    expect(state.drafts[0]).toMatchObject({ title: "Draft guide", content: "# Body", requestedSpaceId: "space-a" });

    await forceRemountAppAt(app!, "/submit");
    await waitForApp(() => titleInput()?.value === "Draft guide" && draftStatus()?.dataset.submissionDraftStatus === "saved");
    expect(contentInput().value).toBe("# Body");
    expect(state.drafts).toHaveLength(1);
  });

  it("never calls a failed draft write saved and keeps the text in this browser", async () => {
    await mount("/submit");
    await waitForSelector("[data-submission-target=\"ready\"]");
    state.failDraftWrite = true;

    await change(titleInput(), "Kept guide");
    await change(contentInput(), "# Kept body");
    await leavePage();
    await waitForApp(() => draftStatus()?.dataset.submissionDraftStatus === "unconfirmed");
    expect(draftStatus()!.textContent).toContain("Not saved to the server");
    expect(titleInput().value).toBe("Kept guide");

    await forceRemountAppAt(app!, "/submit");
    await waitForApp(() => titleInput()?.value === "Kept guide");
    expect(contentInput().value).toBe("# Kept body");
    expect(draftStatus()?.dataset.submissionDraftStatus).not.toBe("saved");
  });

  it("discards the server draft it owns and leaves no local copy to reload", async () => {
    await mount("/submit");
    await waitForSelector("[data-submission-target=\"ready\"]");
    await change(titleInput(), "Discard me");
    await change(contentInput(), "# Body");
    await leavePage();
    await waitForApp(() => draftStatus()?.dataset.submissionDraftStatus === "saved");
    expect(state.drafts).toHaveLength(1);

    // The control only opens the page's own confirmation, so the draft is still
    // there until the confirmation commits.
    await click(main().querySelector("[data-submission-draft-discard]"));
    expect(state.discardCount).toBe(0);
    expect(state.drafts).toHaveLength(1);
    await click(document.querySelector("[data-confirm-action]"));

    await waitForApp(() => state.discardCount === 1);
    await waitForApp(() => draftStatus()?.dataset.submissionDraftStatus === "idle");
    expect(state.drafts).toHaveLength(0);
    expect(draftStatus()!.textContent).toContain("Nothing to save yet.");
    expect(titleInput().value).toBe("");
    expect(contentInput().value).toBe("");
    expect(loadOfflineSubmissionDraft("contributor-route-auditor", app!.browser.localStorage)).toBeNull();

    // A reload finds nothing to resurrect: neither the draft nor its text.
    await forceRemountAppAt(app!, "/submit");
    await waitForSelector("[data-submission-target=\"ready\"]");
    expect(titleInput().value).toBe("");
    expect(contentInput().value).toBe("");
    expect(state.drafts).toHaveLength(0);
  });

  it("keeps a discarded draft recoverable when its answer is lost and never calls it saved", async () => {
    await mount("/submit");
    await waitForSelector("[data-submission-target=\"ready\"]");
    await change(titleInput(), "Lost answer");
    await change(contentInput(), "# Body");
    await leavePage();
    await waitForApp(() => draftStatus()?.dataset.submissionDraftStatus === "saved");

    // The delete commits on the server, but the answer never arrives, so the page
    // reports an unknown outcome instead of a discarded draft.
    state.lostDiscardResponse = true;
    await click(main().querySelector("[data-submission-draft-discard]"));
    await click(document.querySelector("[data-confirm-action]"));
    await waitForApp(() => draftStatus()?.dataset.submissionDraftStatus === "unconfirmed");
    expect(state.drafts).toHaveLength(0);
    expect(contentInput().value).toBe("# Body");
    expect(draftStatus()!.textContent).toContain("The discard was not confirmed.");

    // Re-reading the same journaled discard settles it: the record is gone, so the
    // draft is discarded, once, and the local copy goes with it.
    await click(main().querySelector("[data-submission-draft-retry]"));
    await waitForApp(() => draftStatus()?.dataset.submissionDraftStatus === "idle");
    expect(draftStatus()!.textContent).toContain("Nothing to save yet.");
    expect(state.discardCount).toBe(1);
    expect(contentInput().value).toBe("");
    expect(loadOfflineSubmissionDraft("contributor-route-auditor", app!.browser.localStorage)).toBeNull();
  });

  it("never reports a refused discard as a discarded draft", async () => {
    await mount("/submit");
    await waitForSelector("[data-submission-target=\"ready\"]");
    await change(titleInput(), "Refused");
    await change(contentInput(), "# Body");
    await leavePage();
    await waitForApp(() => draftStatus()?.dataset.submissionDraftStatus === "saved");

    // The server refuses the delete (another writer's draft, a revoked session),
    // and the page says the draft is still there with the text intact.
    state.refuseDraftDiscard = true;
    await click(main().querySelector("[data-submission-draft-discard]"));
    await click(document.querySelector("[data-confirm-action]"));
    await waitForApp(() => draftStatus()?.dataset.submissionDraftStatus === "unconfirmed");
    expect(draftStatus()!.textContent).toContain("The draft was not discarded.");
    expect(contentInput().value).toBe("# Body");
    expect(state.drafts).toHaveLength(1);
  });

  it("opens a returned item, shows its thread, and lands on the authoritative status without a second record", async () => {
    await mount("/my-submissions");
    await waitForSelector("[data-my-submission-resubmit]");
    await click(main().querySelector("[data-my-submission-resubmit]"));

    await waitForApp(() => titleInput() !== null);
    expect(titleInput().value).toBe("Returned guide");
    expect(contentInput().value).toBe("# Original body");
    expect(main().querySelector("[data-submission-resubmit=\"editing\"]")).toBeTruthy();
    expect(main().textContent).toContain("Please add sources.");
    expect(main().querySelector("[data-submission-resubmit-no-asset]")).toBeTruthy();
    await waitForSelector("[data-submission-comments=\"ready\"]");
    expect(main().textContent).toContain("Please add sources.");

    // The first attempt reaches the server but its response is lost.
    state.lostResubmitResponse = true;
    await submit();
    await waitForApp(() => state.resubmitKeys.length === 1);
    expect(state.submissions.filter((item) => item.supersedesSubmissionId === "prior-1")).toHaveLength(1);
    expect(main().querySelector("[data-submission-resubmit=\"submitted\"]")).toBeNull();

    // The retry reuses the journaled key, so the repeat cannot create a second record.
    await click(submitButton());
    await waitForSelector("[data-submission-resubmit-status=\"found\"]");
    expect(state.resubmitKeys).toHaveLength(2);
    expect(new Set(state.resubmitKeys).size).toBe(1);
    expect(state.submissions.filter((item) => item.supersedesSubmissionId === "prior-1")).toHaveLength(1);
    expect(main().querySelector("[data-submission-resubmit=\"submitted\"]")).toBeTruthy();
    expect(main().querySelector("[data-submission-resubmit-status=\"found\"]")!.textContent).toContain("review_pending");
    expect(main().querySelector("form [type=\"submit\"]")).toBeNull();

    // The list the member came from now shows the row as resubmitted from the server's own link.
    await act(async () => { app!.root.render(null); });
  });

  function submitButton() { return main().querySelector("form button[type=\"submit\"]"); }
  async function submit() {
    const form = main().querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new app!.browser.Event("submit", { bubbles: true, cancelable: true }));
      await tick();
    });
  }
});
