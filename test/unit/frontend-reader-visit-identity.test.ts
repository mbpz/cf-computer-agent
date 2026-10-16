// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKnowledgeReaderRequestController } from "../../frontend/lib/knowledge-reader-data";
import { loadReaderVisitIntent } from "../../frontend/lib/reader-visit-intent";

const IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const recordKey = "memory-garden:reader-visit-intent:v1:member-a:knowledge-a";
const malformed = "{\"version\":1,\"member\":\"member-a\",\"item\":\"knowledge-a\",\"identity\":\"../bad\"}";

describe("reader visit identity", () => {
  let data: Map<string, string>;
  let storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  let seen: Array<{ path: string; identity: string | null }>;
  beforeEach(() => {
    data = new Map();
    storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } };
    seen = [];
    vi.stubGlobal("window", { sessionStorage: storage });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function detail() {
    return Response.json({ knowledge: { currentRevision: {
      id: "revision-a", knowledgeItemId: "knowledge-a", title: "Guide", markdown: "# Guide",
      publishedAt: "2026-10-10T00:00:00.000Z", isCurrent: true, previousRevisionId: null,
      sourceVersionId: "source-a", indexStatus: "indexed", chunks: [],
    } } });
  }
  function reader(outcomes: readonly ("lost" | "ok")[]) {
    let attempt = 0;
    return vi.fn((input: string | URL | Request, init?: RequestInit) => {
      seen.push({ path: String(input), identity: new Headers(init?.headers).get("x-visit-id") });
      const outcome = outcomes[Math.min(attempt++, outcomes.length - 1)]!;
      return outcome === "lost" ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve(detail());
    });
  }

  it("reuses one identity across a lost response and a fresh controller, then a new visit gets a new one", async () => {
    const requester = reader(["lost", "ok", "ok"]);
    await expect(createKnowledgeReaderRequestController("member-a", requester).request("knowledge-a").promise).rejects.toThrow();
    const identity = seen[0]!.identity;
    expect(identity).toMatch(IDENTITY_PATTERN);
    expect(seen[0]!.path).toBe("/api/knowledge/knowledge-a");
    // The lost response kept the identity, so a retry after the controller is
    // recreated (app.tsx bumps `retry`) resends exactly the same value.
    expect(loadReaderVisitIntent("member-a", "knowledge-a")).toEqual({ kind: "ready", identity });
    const retry = createKnowledgeReaderRequestController("member-a", requester);
    await expect(retry.request("knowledge-a").promise).resolves.toMatchObject({ revision: { id: "revision-a" } });
    expect(seen[1]!.identity).toBe(identity);
    // The recorded visit is cleared, so a genuinely new read counts again.
    expect(loadReaderVisitIntent("member-a", "knowledge-a")).toEqual({ kind: "empty" });
    await expect(retry.request("knowledge-a").promise).resolves.toBeTruthy();
    expect(seen[2]!.identity).toMatch(IDENTITY_PATTERN);
    expect(seen[2]!.identity).not.toBe(identity);
    expect(loadReaderVisitIntent("member-a", "knowledge-a")).toEqual({ kind: "empty" });
  });

  it("keeps the identity when a read fails with a server error, and reuses it on retry", async () => {
    let attempt = 0;
    const requester = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      seen.push({ path: String(input), identity: new Headers(init?.headers).get("x-visit-id") });
      attempt++;
      return Promise.resolve(attempt === 1 ? Response.json({ error: { code: "DENIED", message: "Denied" } }, { status: 403 }) : detail());
    });
    await expect(createKnowledgeReaderRequestController("member-a", requester).request("knowledge-a").promise).rejects.toThrow();
    expect(loadReaderVisitIntent("member-a", "knowledge-a")).toEqual({ kind: "ready", identity: seen[0]!.identity });
    const retry = createKnowledgeReaderRequestController("member-a", requester);
    await expect(retry.request("knowledge-a").promise).resolves.toBeTruthy();
    expect(seen[1]!.identity).toBe(seen[0]!.identity);
  });

  it("treats a malformed record as absent and never overwrites it", async () => {
    data.set(recordKey, malformed);
    const requester = reader(["ok"]);
    await expect(createKnowledgeReaderRequestController("member-a", requester).request("knowledge-a").promise).resolves.toBeTruthy();
    expect(seen[0]!.identity).toBeNull();
    expect(data.get(recordKey)).toBe(malformed);
  });

  it("does not send or store an identity when the read is not member-keyed", async () => {
    const requester = reader(["ok"]);
    await expect(createKnowledgeReaderRequestController("", requester).request("knowledge-a").promise).resolves.toBeTruthy();
    expect(seen[0]!.identity).toBeNull();
    expect(data.size).toBe(0);
  });

  it("omits the identity when the tab has no session storage", async () => {
    vi.stubGlobal("window", {});
    const requester = reader(["ok"]);
    await expect(createKnowledgeReaderRequestController("member-a", requester).request("knowledge-a").promise).resolves.toBeTruthy();
    expect(seen[0]!.identity).toBeNull();
  });
});
