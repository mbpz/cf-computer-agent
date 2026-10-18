// @vitest-environment node
import React, { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { pageKindForPath } from "../../frontend/app-routes";
import { matchRoute } from "../../frontend/lib/router";
import { resolveFrontendAccess } from "../../frontend/lib/auth-boundary";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const TRASH_PATH = "/admin/knowledge/trash";
const ITEM_PATH = "/admin/knowledge/knowledge-route-audit";

/** A session that holds review permission and one that does not, same admin role. */
const reviewer = {
  member: { id: "admin-1", email: "admin@app.test", role: "admin" as const },
  capabilities: ["knowledge:read", "submission:read-all", "knowledge:review"],
  permissionMask: "0x37ffff",
  logoutUrl: "/auth/logout",
};
const adminWithoutReview = {
  ...reviewer,
  capabilities: ["knowledge:read", "submission:read-all"],
  permissionMask: "0x37fff7",
};

function knowledgeItemPayload(id: string) {
  const publishedAt = "2026-10-01T00:00:00.000Z";
  return {
    knowledge: {
      id, spaceId: "space-route-audit", collectionId: null, title: "Ready item", tagIds: [],
      visibility: "shared", searchStatus: "indexed", publishedAt, updatedAt: publishedAt, status: "active",
      currentRevision: {
        id: `${id}-revision`, knowledgeItemId: id, title: "Ready item", visibility: "shared",
        publishedAt, isCurrent: true, previousRevisionId: null, indexStatus: "indexed",
      },
    },
  };
}

describe("knowledge lifecycle route wiring", () => {
  let journey: MountedApp | undefined;

  afterEach(async () => { await journey?.unmount(); journey = undefined; });

  it("dispatches both administrator knowledge paths to their page kinds", () => {
    expect(pageKindForPath(TRASH_PATH)).toBe("admin-knowledge-trash");
    expect(pageKindForPath(ITEM_PATH)).toBe("admin-knowledge-item");
    // The client page kind accepts any safe id, like the sibling detail pages; only
    // the server's shell path is bounded (asserted in the worker shell test), so a
    // path that reaches the client is never a silent 404 branch.
    expect(pageKindForPath(`/admin/knowledge/${"x".repeat(129)}`)).toBe("admin-knowledge-item");
    expect(pageKindForPath("/admin/knowledge")).toBe("not-found");
    expect(pageKindForPath("/admin/knowledge/")).toBe("not-found");
  });

  it("matches the trash entry exactly and the item page as a gated parameter route", () => {
    // The fixed path wins the exact registry match; the item page is matched only
    // through the parameter prefix, so it cannot shadow the recycle bin.
    expect(matchRoute(TRASH_PATH)).toMatchObject({ path: TRASH_PATH, capability: "knowledge:review", params: {} });
    expect(matchRoute(ITEM_PATH)).toMatchObject({ path: "/admin/knowledge/:id", capability: "knowledge:review", params: { id: "knowledge-route-audit" } });
    expect(matchRoute("/admin/knowledge")).toBeNull();
    expect(matchRoute("/admin/knowledge/")).toBeNull();
    expect(matchRoute("/admin/knowledge/a/listing")).toBeNull();
  });

  it("gates both paths on knowledge:review in the shell", () => {
    for (const path of [TRASH_PATH, ITEM_PATH]) {
      expect(resolveFrontendAccess({ session: reviewer, route: matchRoute(path) })).toEqual({ kind: "allow" });
      // An administrator whose role does not grant review is refused before the page
      // mounts, so no write affordance is ever rendered for them.
      expect(resolveFrontendAccess({ session: adminWithoutReview, route: matchRoute(path) })).toEqual({ kind: "forbidden" });
    }
  });

  it("renders the recycle bin on direct navigation", async () => {
    const reads: string[] = [];
    journey = await mountAuthenticatedApp({
      url: `https://app.test${TRASH_PATH}`,
      role: "admin",
      permissionMask: "0x37ffff",
      configureBrowser: (browser) => installWorkspaceHistoryDriver(browser),
      fetch: async (input) => {
        const path = String(input);
        reads.push(path);
        if (path.startsWith("/api/admin/knowledge/trash")) {
          return Response.json({
            items: [{
              id: "trash-route-audit", spaceId: "space-route-audit", collectionId: null, revisionId: "trash-route-audit-revision",
              title: "Trashed item", visibility: "shared", status: "trashed",
              publishedAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", searchStatus: "indexed",
              retention: { trashedAt: "2026-10-01T00:00:00.000Z", purgeEligibleAt: "2026-10-31T00:00:00.000Z", purgeable: false },
            }],
          });
        }
        return Response.json(knowledgeItemPayload("knowledge-route-audit"));
      },
    });
    await waitForApp(() => journey!.container.querySelector("[data-admin-recycle-bin]") !== null);
    expect(reads.some((path) => path.startsWith("/api/admin/knowledge/trash"))).toBe(true);
    expect(journey.browser.location.pathname).toBe(TRASH_PATH);
  });

  it("renders the item administration page on direct navigation", async () => {
    journey = await mountAuthenticatedApp({
      url: `https://app.test${ITEM_PATH}`,
      role: "admin",
      permissionMask: "0x37ffff",
      configureBrowser: (browser) => installWorkspaceHistoryDriver(browser),
      fetch: async () => Response.json(knowledgeItemPayload("knowledge-route-audit")),
    });
    await waitForApp(() => journey!.container.querySelector("[data-admin-knowledge-item]") !== null);
    expect(journey.container.textContent).toContain("Ready item");
  });

  it("opens the item administration view from a trash row and from a completed restore", async () => {
    let restored = false;
    journey = await mountAuthenticatedApp({
      url: `https://app.test${TRASH_PATH}`,
      role: "admin",
      permissionMask: "0x37ffff",
      configureBrowser: (browser) => installWorkspaceHistoryDriver(browser),
      fetch: async (input, init) => {
        const path = String(input);
        if (init?.method === "POST" && path.endsWith("/restore")) {
          restored = true;
          return Response.json({
            knowledge: {
              id: "trash-route-audit", spaceId: "space-route-audit", collectionId: null, revisionId: "trash-route-audit-revision",
              title: "Trashed item", visibility: "admin_only", status: "active",
              publishedAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z", searchStatus: "indexed",
            },
          });
        }
        if (path.startsWith("/api/admin/knowledge/trash")) {
          return Response.json(restored ? { items: [] } : {
            items: [{
              id: "trash-route-audit", spaceId: "space-route-audit", collectionId: null, revisionId: "trash-route-audit-revision",
              title: "Trashed item", visibility: "admin_only", status: "trashed",
              publishedAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", searchStatus: "indexed",
              retention: { trashedAt: "2026-10-01T00:00:00.000Z", purgeEligibleAt: "2026-10-31T00:00:00.000Z", purgeable: false },
            }],
          });
        }
        return Response.json(knowledgeItemPayload("trash-route-audit"));
      },
    });
    await waitForApp(() => journey!.container.querySelector('[data-trash-open-item="trash-route-audit"]') !== null);

    // The row's own entry point navigates to the item's administration page.
    await act(async () => {
      (journey!.container.querySelector('[data-trash-open-item="trash-route-audit"]') as HTMLAnchorElement).click();
    });
    await waitForApp(() => journey!.browser.location.pathname === "/admin/knowledge/trash-route-audit");
    expect(journey.container.querySelector("[data-admin-knowledge-item]")).not.toBeNull();

    // A restore makes the item administrable again, and the success offers that page.
    await act(async () => { journey!.browser.history.back(); });
    await waitForApp(() => journey!.container.querySelector('[data-trash-restore="trash-route-audit"]') !== null);
    await act(async () => {
      (journey!.container.querySelector('[data-trash-restore="trash-route-audit"]') as HTMLButtonElement).click();
    });
    await waitForApp(() => journey!.container.querySelector('[data-trash-open-restored="trash-route-audit"]') !== null);
    await act(async () => {
      (journey!.container.querySelector('[data-trash-open-restored="trash-route-audit"]') as HTMLAnchorElement).click();
    });
    await waitForApp(() => journey!.browser.location.pathname === "/admin/knowledge/trash-route-audit");
  });
});
