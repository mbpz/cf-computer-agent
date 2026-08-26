import { describe, expect, it, vi } from "vitest";
import { createSavedView, deleteSavedView, loadSavedViews, normalizeSavedView } from "../../frontend/lib/saved-views-data";

describe("Saved View frontend data", () => {
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
      if (path === "/api/saved-views") return Response.json({ id: "view-2", name: "Docs", filters: { q: "docs", tagIds: [] } }, { status: 201 });
      return new Response(null, { status: 204 });
    });
    await expect(loadSavedViews(requester)).resolves.toHaveLength(1);
    await expect(createSavedView("Docs", { q: "docs" }, requester)).resolves.toMatchObject({ id: "view-2" });
    await deleteSavedView("view/2", requester);
    expect(requester).toHaveBeenLastCalledWith("/api/saved-views/view%2F2", expect.objectContaining({ method: "DELETE" }));
    expect(requester.mock.calls[1]?.[1]).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });
    expect(JSON.parse(String(requester.mock.calls[1]?.[1]?.body))).toEqual({ name: "Docs", filters: { v: 1, q: "docs", spaceId: null, collectionId: null, tagIds: [], tagMode: "or" } });
  });
});
