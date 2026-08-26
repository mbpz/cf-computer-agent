// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildRevisionDiff, type DiffDocument } from "../../src/library/revision-diff";

const document = (overrides: Partial<DiffDocument> = {}): DiffDocument => ({
  id: "revision-a",
  title: "Guide",
  tags: ["one"],
  visibility: "shared",
  parserSchemaVersion: "m1-v2",
  codeMetadata: null,
  markdown: "# Guide\n\nKeep\nRemove me\n",
  ...overrides,
});

describe("revision diff", () => {
  it("returns bounded line operations and metadata changes", () => {
    const result = buildRevisionDiff(
      document(),
      document({
        id: "revision-b",
        title: "Updated guide",
        tags: ["one", "two"],
        markdown: "# Guide\n\nKeep\nAdd me\n",
      }),
    );

    expect(result).toMatchObject({
      fromRevisionId: "revision-a",
      toRevisionId: "revision-b",
      changed: true,
      stats: { added: 1, removed: 1, truncated: false },
      metadataChanges: [
        { field: "title", from: "Guide", to: "Updated guide" },
        { field: "tags", from: ["one"], to: ["one", "two"] },
      ],
    });
    expect(result.hunks[0]?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "removed", text: "Remove me" }),
      expect.objectContaining({ kind: "added", text: "Add me" }),
    ]));
  });

  it("is deterministic and caps output for very large revisions", () => {
    const from = document({ markdown: Array.from({ length: 3_000 }, (_, index) => `old-${index}`).join("\n") });
    const to = document({ markdown: Array.from({ length: 3_000 }, (_, index) => `new-${index}`).join("\n") });
    const first = buildRevisionDiff(from, to);
    const second = buildRevisionDiff(from, to);
    expect(first).toEqual(second);
    expect(first.stats.truncated).toBe(true);
    expect(first.hunks.flatMap((hunk) => hunk.lines)).toHaveLength(240);
    expect(first.stats.added).toBe(3_000);
    expect(first.stats.removed).toBe(3_000);
  });

  it("reports unchanged revisions without synthetic lines", () => {
    const result = buildRevisionDiff(document(), document());
    expect(result.changed).toBe(false);
    expect(result.metadataChanges).toEqual([]);
    expect(result.stats).toEqual({ added: 0, removed: 0, unchanged: 5, truncated: false });
    expect(result.hunks[0]?.lines.every((line) => line.kind === "context")).toBe(true);
  });
});
