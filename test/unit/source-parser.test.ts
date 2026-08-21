import { describe, expect, it } from "vitest";
import { parseSource } from "../../src/sources/parser";

describe("parseSource", () => {
  it.each([
    ["text", "A\r\nB\rC", "A\nB\nC"],
    ["markdown", "# Title  \r\n\r\nBody", "# Title\n\nBody\n"],
  ] as const)("normalizes %s deterministically", async (kind, content, expected) => {
    const first = await parseSource({ kind, content });
    const second = await parseSource({ kind, content });

    expect(first.normalizedMarkdown).toBe(expected);
    expect(first).toEqual(second);
    expect(first.parserVersion).toBe("m1-v1");
  });

  it("wraps code in an injection-safe fenced block with an allowlisted language", async () => {
    await expect(parseSource({
      kind: "code",
      content: "const marker = ```;\r\n",
      language: "typescript",
    })).resolves.toMatchObject({
      normalizedMarkdown: "````typescript\nconst marker = ```;\n````\n",
      lineCount: 3,
    });

    await expect(parseSource({
      kind: "code",
      content: "alert(1)",
      language: "js onload=alert(1)",
    })).resolves.toMatchObject({
      normalizedMarkdown: "```\nalert(1)\n```\n",
    });
  });

  it("escapes plain-text Markdown metacharacters so the source renders literally", async () => {
    await expect(parseSource({
      kind: "text",
      content: "# heading\n*em* [click](javascript:alert(1)) <img src=x onerror=alert(1)>",
    })).resolves.toMatchObject({
      normalizedMarkdown: "\\# heading\n\\*em\\* \\[click\\]\\(javascript\\:alert\\(1\\)\\) \\<img src\\=x onerror\\=alert\\(1\\)\\>",
    });
  });

  it.each([
    "<img src=x onerror=alert(1)>",
    "<svg/onload=alert(1)>",
  ])("rejects Markdown raw HTML with executable event attributes: %s", async (html) => {
    await expect(parseSource({
      kind: "markdown",
      content: `# Safe heading\n\n${html}`,
    })).rejects.toMatchObject({ code: "SOURCE_INVALID", status: 400 });
  });

  it.each([
    "[click](javascript:alert(1))",
    "![payload](data:text/plain,active-content)",
  ])("rejects executable Markdown link destinations: %s", async (markdown) => {
    await expect(parseSource({ kind: "markdown", content: markdown }))
      .rejects.toMatchObject({ code: "SOURCE_INVALID", status: 400 });
  });

  it("preserves legitimate Markdown structure when no raw HTML is present", async () => {
    await expect(parseSource({
      kind: "markdown",
      content: "# Heading\n\n- **bold**\n- [safe](https://example.test)\n",
    })).resolves.toMatchObject({
      normalizedMarkdown: "# Heading\n\n- **bold**\n- [safe](https://example.test)\n",
    });
  });

  it("hashes the normalized UTF-8 bytes with a 32-byte lowercase SHA-256", async () => {
    await expect(parseSource({ kind: "text", content: "abc" })).resolves.toMatchObject({
      contentSha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    });
  });

  it("accepts exactly 128 KiB and rejects one additional UTF-8 byte", async () => {
    await expect(parseSource({ kind: "text", content: "a".repeat(128 * 1024) })).resolves.toMatchObject({
      parserVersion: "m1-v1",
    });
    await expect(parseSource({ kind: "text", content: "a".repeat(128 * 1024 + 1) }))
      .rejects.toMatchObject({ code: "SOURCE_INVALID", status: 400 });
  });

  it.each([
    ["NUL", "before\0after"],
    ["unpaired high surrogate", "before\ud800after"],
    ["unpaired low surrogate", "before\udc00after"],
  ])("rejects %s instead of hashing replacement text", async (_label, content) => {
    await expect(parseSource({ kind: "text", content }))
      .rejects.toMatchObject({ code: "SOURCE_INVALID", status: 400 });
  });
});
