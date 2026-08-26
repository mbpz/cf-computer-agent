// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { apiFetch, parseApiError } from "../../frontend/lib/api";
import { sessionSnapshot } from "../../frontend/lib/session";

describe("frontend API adapter", () => {
  it("uses same-origin credentials and parses JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await apiFetch<{ ok: boolean }>("/api/health", { requester: fetcher });
    expect(result).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith("/api/health", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("maps structured errors and preserves the request id", async () => {
    const response = new Response(JSON.stringify({ error: { code: "DENIED", message: "No", retryable: false, requestId: "req-1" } }), { status: 403, headers: { "x-request-id": "req-1" } });
    await expect(parseApiError(response)).resolves.toEqual({ code: "DENIED", message: "No", status: 403, retryable: false, requestId: "req-1" });
  });

  it("rejects malformed error bodies without leaking response text", async () => {
    const response = new Response("secret-body", { status: 500, headers: { "x-request-id": "req-2" } });
    await expect(parseApiError(response)).resolves.toEqual({ code: "API_ERROR", message: "The request failed.", status: 500, retryable: true, requestId: "req-2" });
  });

  it("loads the existing session contract", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ member: { id: "m1", email: "a@example.com", role: "contributor" }, capabilities: ["knowledge:read"], logoutUrl: "/auth/logout" }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(sessionSnapshot(fetcher)).resolves.toMatchObject({ member: { id: "m1" } });
    expect(fetcher).toHaveBeenCalledWith("/api/session", expect.objectContaining({ cache: "no-store", credentials: "same-origin", headers: { accept: "application/json" } }));
  });
});
