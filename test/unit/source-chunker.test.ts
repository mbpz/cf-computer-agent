import { describe, expect, it } from "vitest";
import { chunkDocument } from "../../src/sources/chunker";

describe("chunkDocument", () => {
  it("tracks heading paths and 1-based source lines", () => {
    const input = {
      kind: "markdown" as const,
      normalizedMarkdown: "# A\n第一段知识。\n\n## B\nconst answer = 42;\n",
    };

    const chunks = chunkDocument(input, { maxCodePoints: 400, overlapCodePoints: 40 });

    expect(chunks).toEqual([
      expect.objectContaining({ ordinal: 0, headingPath: ["A"], startLine: 2, endLine: 2 }),
      expect.objectContaining({ ordinal: 1, headingPath: ["A", "B"], startLine: 5, endLine: 5 }),
    ]);
  });

  it("splits long text on code-point boundaries and applies bounded overlap", () => {
    const input = {
      kind: "text" as const,
      normalizedMarkdown: "前😀后abcdefghij",
    };
    const chunks = chunkDocument(input, { maxCodePoints: 8, overlapCodePoints: 2 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect([...chunk.body].length).toBeLessThanOrEqual(8);
      expect(chunk.body).not.toMatch(/[\ud800-\udfff]/u);
      expect(chunk.body).not.toBe("");
      expect(chunk.startLine).toBe(1);
      expect(chunk.endLine).toBe(1);
    }
    expect(chunks[0].body.slice(-2)).toBe(chunks[1].body.slice(0, 2));
  });

  it("does not emit a whitespace-only unit at a line boundary", () => {
    const chunks = chunkDocument({
      kind: "markdown",
      normalizedMarkdown: "a\nb",
    }, { maxCodePoints: 1, overlapCodePoints: 0 });

    expect(chunks.map(({ body }) => body)).toEqual(["a", "b"]);
  });

  it("reports absolute document lines when splitting after headings and blanks", () => {
    const chunks = chunkDocument({
      kind: "markdown",
      normalizedMarkdown: "# Context\n\nabcdefghij\nklmnopqrst\n",
    }, { maxCodePoints: 8, overlapCodePoints: 2 });

    expect(chunks.map(({ startLine, endLine }) => [startLine, endLine])).toEqual([
      [3, 3], [3, 4], [4, 4], [4, 4],
    ]);
  });

  it("does not create chunks for whitespace-only normalized input", () => {
    expect(chunkDocument({
      kind: "markdown",
      normalizedMarkdown: " \n\t\n",
    })).toEqual([]);
  });

  it("keeps heading-only Markdown meaningful and searchable", () => {
    const chunks = chunkDocument({
      kind: "markdown",
      normalizedMarkdown: "\n# A\n\n## B\n",
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ startLine: 2, endLine: 2, body: "# A", searchBody: "a" });
  });

  it("keeps a short fenced code block intact", () => {
    const input = {
      kind: "markdown" as const,
      normalizedMarkdown: "# Code\n```ts\nconst answer = 42;\n```\n",
    };

    const chunks = chunkDocument(input, { maxCodePoints: 40, overlapCodePoints: 4 });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      headingPath: ["Code"],
      startLine: 2,
      endLine: 4,
      body: "```ts\nconst answer = 42;\n```",
    });
  });

  it("splits an oversized fenced code block only at complete lines", () => {
    const input = {
      kind: "code" as const,
      normalizedMarkdown: "```ts\n0123456789\nabcdefghij\nklmnopqrst\n```\n",
    };

    const chunks = chunkDocument(input, { maxCodePoints: 18, overlapCodePoints: 4 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.body.split("\n").every((line) =>
        input.normalizedMarkdown.split("\n").includes(line),
      )).toBe(true);
    }
    expect(chunks.map((chunk) => chunk.startLine)).toEqual([1, 3, 4]);
    expect(chunks.map((chunk) => chunk.endLine)).toEqual([2, 3, 5]);
  });

  it("indexes shared unicode61 tokens, underscore separators, and adjacent Han bigrams", () => {
    const chunks = chunkDocument({
      kind: "markdown",
      normalizedMarkdown: "Cloud COMPUTE foo_bar 第一段知识。",
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].searchBody).toContain("cloud");
    expect(chunks[0].searchBody).toContain("compute");
    expect(chunks[0].searchBody).toContain("foo bar");
    expect(chunks[0].searchBody).not.toContain("foo_bar");
    expect(chunks[0].searchBody).toContain("第一");
    expect(chunks[0].searchBody).toContain("一段");
    expect(chunks[0].searchBody).toContain("段知");
    expect(chunks[0].searchBody).toContain("知识");
    expect(chunks[0].searchBody).toBe(chunks[0].searchBody.toLowerCase());
  });

  it("indexes I/i/İ once while retaining dotless ı as a distinct FTS token", () => {
    const chunks = chunkDocument({
      kind: "markdown",
      normalizedMarkdown: "I i İ ı",
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.searchBody).toBe("i ı");
    expect(chunks[0]!.searchBody.split(" ")).toHaveLength(2);
  });

  it("is repeatable and emits ordered, non-empty chunks within source lines", () => {
    const input = {
      kind: "markdown" as const,
      normalizedMarkdown: "# One\n\nA paragraph with 😀 and enough words to split.\n\n## Two\n第二段知识。\n",
    };
    const options = { maxCodePoints: 16, overlapCodePoints: 3 };
    const first = chunkDocument(input, options);
    const second = chunkDocument(input, options);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    for (const [index, chunk] of first.entries()) {
      expect(chunk.ordinal).toBe(index);
      expect(chunk.body.length).toBeGreaterThan(0);
      expect(chunk.searchBody.length).toBeGreaterThan(0);
      expect(chunk.startLine).toBeGreaterThanOrEqual(1);
      expect(chunk.startLine).toBeLessThanOrEqual(chunk.endLine);
      expect(chunk.endLine).toBeLessThanOrEqual(input.normalizedMarkdown.split("\n").length - 1);
      if (index > 0) expect(chunk.startLine).toBeGreaterThanOrEqual(first[index - 1].startLine);
    }
  });
});
