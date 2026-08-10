import { describe, expect, it } from "vitest";
import { safeId, searchNotes } from "../../src/knowledge/search";
import type { SearchDocument } from "../../src/knowledge/types";
import { APP_CONFIG } from "../../src/config";

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
  it("truncates supplementary Unicode without leaving an unpaired surrogate", () => {
    const id = safeId(`a${"\u{10401}".repeat(64)}`);
    expect([...id].length).toBeLessThanOrEqual(64);
    expect(new TextEncoder().encode(id).byteLength).toBeLessThanOrEqual(APP_CONFIG.maxNoteIdBytes);
    expect(id).toMatch(/^[\p{L}\p{N}]+$/u);
    expect([...id].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 0xd800 && codePoint <= 0xdfff;
    })).toBe(false);
  });
});
