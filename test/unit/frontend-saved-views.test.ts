import { describe, expect, it, vi } from "vitest";
import { createSavedView, deleteSavedView, loadSavedViews, normalizeSavedView, updateSavedView, findSavedView, savedViewIsAbsent } from "../../frontend/lib/saved-views-data";

import { SavedViewsService } from "../../src/saved-views/service";
import type { SavedViewsRepositoryPort } from "../../src/saved-views/repository";

describe("Saved View frontend data", () => {
  it("sends create and update filters accepted by the actual service", async () => {
    const repository = {
      create: vi.fn(async (input) => input),
      update: vi.fn(async (_member, id, input) => ({ id, ...input })),
    } as unknown as SavedViewsRepositoryPort;
    const service = new SavedViewsService(repository, { id: () => "view-contract" });
    const requester = async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const result = init?.method === "POST"
        ? await service.create("member-contract", body)
        : await service.update("member-contract", "view-contract", body);
      return Response.json(result, { status: init?.method === "POST" ? 201 : 200 });
    };
    await expect(createSavedView(" Docs ", { q: " docs ", tagIds: ["tag-a"] }, requester)).resolves.toMatchObject({ name: "Docs", filters: { v: 1, q: "docs" } });
    await expect(updateSavedView("view-contract", "Docs", { q: "next" }, requester)).resolves.toMatchObject({ filters: { v: 1, q: "next" } });
  });
  it.each([
    { id: "view-1", name: "Docs" },
    { id: "view-1", name: "Other", updatedAt: "2026-10-02T00:00:00.000Z", filters: { v: 1, q: "docs", spaceId: null, collectionId: null, tagIds: [], tagMode: "or" } },
  ])("does not acknowledge an incomplete or mismatched create receipt %j", async (body) => {
    await expect(createSavedView("Docs", { q: "docs" }, async () => Response.json(body, { status: 201 }))).rejects.toThrow("SAVED_VIEW_INVALID");
  });
  it("does not treat a 200 HTML delete response as confirmed deletion", async () => {
    await expect(deleteSavedView("view-1", async () => new Response("<html>login</html>"))).rejects.toThrow("SAVED_VIEW_INVALID");
  });
  it("fails closed for malformed or repeated reconciliation cursors", async () => {
    let requests = 0;
    await expect(findSavedView("Docs", { q: "docs" }, async () => { requests++; return Response.json({ items: [], nextCursor: "same-cursor" }); })).rejects.toThrow("SAVED_VIEW_INVALID");
    expect(requests).toBe(2);
    await expect(findSavedView("Docs", {}, async () => Response.json({ items: [{ id: "view-1", name: "Docs" }] }))).rejects.toThrow("SAVED_VIEW_INVALID");
  });
  it("bounds reconciliation reads and treats an exhausted bound as inconclusive", async () => {
    let requests = 0;
    await expect(findSavedView("Docs", {}, async () => Response.json({ items: [], nextCursor: `cursor-${++requests}` }))).resolves.toBeNull();
    expect(requests).toBe(20);
  });
  it("does not accept a wrong-id read or a different view as reconciliation", async () => {
    const item = { id: "view-other", name: "Docs", updatedAt: "2026-10-02T00:00:00.000Z", filters: { v: 1, q: "other", spaceId: null, collectionId: null, tagIds: [], tagMode: "or" } };
    await expect(savedViewIsAbsent("view-1", async () => Response.json(item))).rejects.toThrow("SAVED_VIEW_INVALID");
    await expect(findSavedView("Docs", { q: "docs" }, async () => Response.json({ items: [item] }))).resolves.toBeNull();
  });
  it("normalizes only the bounded view/filter contract", () => {
    expect(normalizeSavedView({ id: "view-1", name: "Docs", filters: { v: 1, q: "docs", tagIds: ["tag-a", 4], tagMode: "and" } })).toEqual({
      id: "view-1", name: "Docs", updatedAt: "", filters: { v: 1, q: "docs", spaceId: null, collectionId: null, tagIds: ["tag-a"], tagMode: "and" },
    });
    expect(normalizeSavedView({ id: "", name: "Docs" })).toBeNull();
  });

  it("uses owner-scoped API paths and canonical filter payloads", async () => {
    const requester = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/saved-views?limit=50") return Response.json({ items: [{ id: "view-1", name: "Docs", filters: { q: "docs" } }] });
      if (path === "/api/saved-views") return Response.json({ id: "view-2", name: "Docs", updatedAt: "2026-10-02T00:00:00.000Z", filters: { v: 1, q: "docs", spaceId: null, collectionId: null, tagIds: [], tagMode: "or" } }, { status: 201 });
      return new Response(null, { status: 204 });
    });
    await expect(loadSavedViews(requester)).resolves.toHaveLength(1);
    await expect(createSavedView("Docs", { q: "docs" }, requester)).resolves.toMatchObject({ id: "view-2" });
    await deleteSavedView("view/2", requester);
    expect(requester).toHaveBeenLastCalledWith("/api/saved-views/view%2F2", expect.objectContaining({ method: "DELETE" }));
    expect(requester.mock.calls[1]?.[1]).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });
    expect(JSON.parse(String(requester.mock.calls[1]?.[1]?.body))).toEqual({ name: "Docs", filters: { q: "docs", spaceId: null, collectionId: null, tagIds: [], tagMode: "or" } });
  });
});
