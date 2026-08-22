import { describe, expect, it } from "vitest";
import { normalizeSearchQuery } from "../../src/library/lexical";
import { buildSearchPresentation, SEARCH_POLICY } from "../../src/library/search-policy";
import { chunkDocument } from "../../src/sources/chunker";
import { M1_FENCE_FIELD_EXPECTATIONS } from "../fixtures/m1-evaluation";

describe("versioned search policy", () => {
  it("derives stable allowlisted matched fields and inert code-point highlights", () => {
    const query = normalizeSearchQuery("权限 foo_bar café");

    const presentation = buildSearchPresentation(
      "😀<b>权限</b> foo_bar cafe\u0301",
      query.termKeys,
      ["code", "title", "code", "not-a-field", "tags"],
    );

    expect(presentation).toEqual({
      excerpt: "😀<b>权限</b> foo_bar café",
      matchedFields: ["title", "tags", "code"],
      highlights: [
        { start: 4, end: 6 },
        { start: 11, end: 14 },
        { start: 15, end: 18 },
        { start: 19, end: 23 },
      ],
    });
    expect(presentation.excerpt).not.toContain("<mark>");
    expect(presentation.excerpt).toContain("<b>");
    expect(SEARCH_POLICY).toEqual({
      version: 2,
      weights: { title: 8, summary: 4, tags: 6, body: 1, code: 3 },
      maxTags: 8,
      maxHighlights: 8,
    });
  });

  it("bounds excerpts and translates ranges after a leading ellipsis", () => {
    const body = `${"前".repeat(200)} target ${"后".repeat(200)}`;
    const presentation = buildSearchPresentation(body, ["TARGET"], ["body"]);

    expect([...presentation.excerpt]).toHaveLength(240);
    expect(presentation.excerpt.startsWith("…")).toBe(true);
    expect(presentation.excerpt.endsWith("…")).toBe(true);
    expect(presentation.highlights).toEqual([{ start: 60, end: 66 }]);
    expect([...presentation.excerpt].slice(60, 66).join("")).toBe("target");
  });

  it("keeps hand-labelled fence and field classification independent of index helpers", () => {
    for (const fixture of M1_FENCE_FIELD_EXPECTATIONS) {
      const chunks = chunkDocument({
        kind: fixture.sourceKind,
        normalizedMarkdown: fixture.normalizedMarkdown,
      });
      expect(chunks, fixture.id).toEqual(expect.arrayContaining([
        expect.objectContaining({
          body: fixture.expectedBody,
          indexField: fixture.expectedIndexField,
        }),
      ]));
    }
  });
});
