import { describe, expect, it } from "vitest";
import { buildIndexDocument } from "../../src/indexing/document";
import { chunkDocument } from "../../src/sources/chunker";

describe("buildIndexDocument", () => {
  it("assigns governed metadata, prose, and fenced code to deterministic separate fields", () => {
    const content = [
      "# Indexing",
      "",
      `${"😀".repeat(238)} tail prose`,
      "",
      "```typescript",
      "dangerousCall();",
      "```",
      "",
    ].join("\n");
    const chunks = chunkDocument({ normalizedMarkdown: content, kind: "markdown" });

    const document = buildIndexDocument(
      { id: "revision-1", title: "  Governed title  " },
      chunks,
      [
        { id: "tag-b", slug: "  RECOVERY  ", name: "  Retry   Safety " },
        { id: "tag-a", slug: "search", name: " Search  Quality " },
        { id: "tag-a", slug: "search", name: "Search Quality" },
      ],
    );

    expect(document).toEqual({
      revisionId: "revision-1",
      title: "Governed title",
      summary: `${"😀".repeat(238)} t`,
      tags: "recovery Retry Safety search Search Quality",
      body: expect.stringContaining("tail prose"),
      code: expect.stringContaining("dangerouscall"),
    });
    expect([...document.summary]).toHaveLength(240);
    expect(document.body).not.toContain("dangerousCall");
    expect(document.code).not.toContain("tail prose");
    expect(document.code).toContain("dangerouscall");
    expect(document.code).not.toContain("<script");
  });

  it("treats executable-looking Markdown as inert text and bounds every field", () => {
    const content = "[do not run](javascript:alert(1))\n\n```shell\nrm -rf /\n```\n";
    const chunks = chunkDocument({ normalizedMarkdown: content, kind: "markdown" });

    const document = buildIndexDocument(
      { id: "revision-2", title: "T".repeat(400) },
      chunks,
      [{ id: "tag", slug: "s".repeat(200), name: "N".repeat(400) }],
    );

    expect(document.body).toContain("javascript alert");
    expect(document.code).toContain("rm rf");
    expect([...document.title].length).toBeLessThanOrEqual(200);
    expect([...document.summary].length).toBeLessThanOrEqual(240);
    expect(new TextEncoder().encode(document.tags).byteLength).toBeLessThanOrEqual(16_384);
    expect(new TextEncoder().encode(document.body).byteLength).toBeLessThanOrEqual(131_072);
    expect(new TextEncoder().encode(document.code).byteLength).toBeLessThanOrEqual(131_072);
  });

  it("uses the chunker's structural field without re-parsing fence syntax", () => {
    const document = buildIndexDocument(
      { id: "revision-structure", title: "Structure" },
      [{
        ordinal: 0,
        indexField: "code",
        headingPath: [],
        startLine: 1,
        endLine: 1,
        body: "structural_code();",
        searchBody: "structural code",
      }],
      [],
    );

    expect(document.body).toBe("");
    expect(document.code).toBe("structural code");
  });
});
