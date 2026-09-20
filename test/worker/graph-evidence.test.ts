/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/http";
import { routeGraphApi } from "../../src/routes/graph";
import { routeLibraryApi } from "../../src/routes/library";
import type { Principal } from "../../src/identity/principal";

const contributor: Principal = {
  kind: "member",
  memberId: "member-a",
  identitySubject: "subject-a",
  email: "a@example.test",
  role: "contributor",
};

const citation = {
  citationId: "citation-a",
  knowledgeItemId: "knowledge-a",
  revisionId: "revision-a",
  chunkId: "chunk-a",
  title: "Authorized source",
  headingPath: ["Planning"],
  startLine: 4,
  endLine: 8,
  location: { kind: "pdf", page: 3 },
  body: "Private source body must not enter a graph snapshot.",
  publishedAt: "2026-09-20T00:00:00.000Z",
};

function services(readCitation: (scope: unknown, citationId: string) => Promise<unknown>) {
  return { library: { readCitation } } as never;
}

describe("graph evidence authorization boundary", () => {
  it("returns an authorized citation only through the member-scoped library route", async () => {
    const readCitation = vi.fn(async (scope: any, citationId: string) => {
      expect(scope).toMatchObject({ memberId: "member-a", role: "contributor" });
      expect(citationId).toBe("citation-a");
      return citation;
    });

    const response = await routeLibraryApi(
      new Request("https://memory.crgmhrc.asia/api/knowledge/citations/citation-a"),
      new URL("https://memory.crgmhrc.asia/api/knowledge/citations/citation-a"),
      { requestId: "graph-evidence-authorized" },
      contributor,
      services(readCitation),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({ citation: { citationId: "citation-a", knowledgeItemId: "knowledge-a" } });
    expect(readCitation).toHaveBeenCalledTimes(1);
  });

  it.each(["hidden-citation", "inactive-citation", "trashed-citation", "absent-citation"])(
    "returns the same not-found contract for an inaccessible %s",
    async (citationId) => {
      const readCitation = vi.fn(async () => {
        throw new AppError("KNOWLEDGE_NOT_FOUND", "Knowledge was not found", 404);
      });

      await expect(routeLibraryApi(
        new Request(`https://memory.crgmhrc.asia/api/knowledge/citations/${citationId}`),
        new URL(`https://memory.crgmhrc.asia/api/knowledge/citations/${citationId}`),
        { requestId: `graph-evidence-${citationId}` },
        contributor,
        services(readCitation),
      )).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND", status: 404 });
      expect(readCitation).toHaveBeenCalledWith(expect.objectContaining({ memberId: "member-a" }), citationId);
    },
  );

  it("keeps citation references opaque in the Graph snapshot", async () => {
    const response = await routeGraphApi(
      new Request("https://memory.crgmhrc.asia/api/graph?scope=workspace"),
      new URL("https://memory.crgmhrc.asia/api/graph?scope=workspace"),
      { requestId: "graph-evidence-snapshot" },
      contributor,
      {
        graph: {
          get: async (memberId: string) => {
            expect(memberId).toBe("member-a");
            return {
              rootId: null,
              depth: 1 as const,
              truncated: false,
              nodes: [{ id: "knowledge:knowledge-a", kind: "knowledge" as const, label: "Authorized source", status: "published", href: "/knowledge/knowledge-a", metadata: {} }],
              edges: [],
            };
          },
        },
      },
    );

    const text = await response?.text();
    expect(response?.status).toBe(200);
    expect(text).not.toContain("body");
    expect(text).not.toContain("member_id");
    expect(text).not.toContain("memberId");
  });
});
