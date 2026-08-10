import { describe, expect, it } from "vitest";
import { safeId, searchNotes, type SearchDocument } from "../../src/search";

const doc = (data: Partial<SearchDocument>): SearchDocument => ({
  id: "one", title: "Project notes", tags: ["work"], content: "The launch checklist contains monitoring.",
  path: "/workspace/notes/one.md", createdAt: "2026-01-01", updatedAt: "2026-01-02", ...data,
});

describe("searchNotes", () => {
  it("weights title and tag matches above body-only matches", () => {
    const hits = searchNotes("launch", [doc({ id: "body" }), doc({ id: "title", title: "Launch plan", content: "other" })]);
    expect(hits.map((hit) => hit.id)).toEqual(["title", "body"]);
  });
  it("supports Chinese terms and excerpts", () => {
    const [hit] = searchNotes("知识库", [doc({ title: "想法", content: "这是我的个人知识库设计。" })]);
    expect(hit.excerpt).toContain("个人知识库");
  });
  it("returns no hits for empty queries", () => expect(searchNotes(" ", [doc({})])).toEqual([]));
});

describe("safeId", () => {
  it("normalizes a title without path characters", () => expect(safeId(" My / First Note ")).toBe("my-first-note"));
});
