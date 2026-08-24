import { describe, expect, it } from "vitest";
import { parseSource, SOURCE_PARSER_CONTRACT, sourceParser } from "../../src/sources/parser";
import { decodeSourceBytes } from "../../src/sources/decoder";
import { m1ParserCases } from "../fixtures/m1-parser-cases";

describe("parseSource", () => {
  it("exposes a frozen versioned contract and replays the same output schema", async () => {
    expect(SOURCE_PARSER_CONTRACT).toEqual({
      parserVersion: "m1-v1",
      parserSchemaVersion: "m1-v2",
      outputFields: [
        "normalizedMarkdown", "contentSha256", "parserVersion", "parserSchemaVersion",
        "sourceIdentitySha256", "warnings", "codeMetadata", "lineCount",
      ],
    });
    expect(Object.isFrozen(SOURCE_PARSER_CONTRACT)).toBe(true);
    const input = { kind: "markdown" as const, content: "# Stable\r\n\r\nBody\n" };
    const first = await sourceParser.parse(input);
    const replay = await sourceParser.parse(input);
    expect(replay).toEqual(first);
    expect(Object.keys(first).sort()).toEqual([...SOURCE_PARSER_CONTRACT.outputFields].sort());
  });

  it.each(m1ParserCases.filter((fixture) => fixture.expected.ok))(
    "normalizes independent byte fixture $id with M1-v2 metadata",
    async (fixture) => {
      const expected = fixture.expected;
      if (!expected.ok) throw new Error("Expected a valid parser fixture");
      const content = decodeSourceBytes(fixture.bytes.slice().buffer as ArrayBuffer);
      const parsed = await parseSource({ kind: fixture.kind, content, ...fixture.metadata });

      expect(parsed).toMatchObject({
        normalizedMarkdown: expected.markdown,
        lineCount: expected.lineCount,
        warnings: expected.warnings,
        parserSchemaVersion: "m1-v2",
      });
      if (fixture.kind === "code") {
        expect(parsed.codeMetadata).toEqual({
          language: fixture.metadata?.language,
          fileLabel: fixture.metadata?.fileLabel,
          lineBaseline: fixture.metadata?.lineBaseline,
        });
      } else {
        expect(parsed.codeMetadata).toBeNull();
      }
    },
  );

  it.each(m1ParserCases.filter((fixture) => !fixture.expected.ok && fixture.expected.code !== "SOURCE_ENCODING_INVALID"))(
    "rejects invalid independent fixture $id before persistence",
    async (fixture) => {
      const expected = fixture.expected;
      if (expected.ok) throw new Error("Expected an invalid parser fixture");
      const content = new TextDecoder().decode(fixture.bytes);
      await expect(parseSource({ kind: fixture.kind, content, ...fixture.metadata }))
        .rejects.toMatchObject({ code: expected.code, status: 400 });
    },
  );

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
    })).rejects.toMatchObject({ code: "SOURCE_METADATA_INVALID", status: 400 });
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
    })).rejects.toMatchObject({ code: "SOURCE_METADATA_INVALID", status: 400 });
  });

  it.each([
    "[click](javascript:alert(1))",
    "![payload](data:text/plain,active-content)",
    "[escaped](javascript\\:alert(1))",
    "[decimal](javascript&#58;alert(1))",
    "[hex](javascript&#x3A;alert(1))",
    "[named](javascript&colon;alert(1))",
    "[case](JaVaScRiPt&#58;alert(1))",
    "[tab](java&#9;script&#58;alert(1))",
    "[named-tab](java&Tab;script&colon;alert(1))",
    "[newline](java&#x0A;script&#x3a;alert(1))",
    "[control](java&#x0D;script\\:alert(1))",
  ])("rejects executable Markdown link destinations: %s", async (markdown) => {
    await expect(parseSource({ kind: "markdown", content: markdown }))
      .rejects.toMatchObject({ code: "SOURCE_METADATA_INVALID", status: 400 });
  });

  it.each([
    "# Heading\n\n- **bold**\n- [safe](https://example.test/path?q=1#part)\n",
    "[section](#heading)\n",
    "[relative](../guide/page.md)\n",
  ])("preserves legitimate Markdown destination structure: %s", async (markdown) => {
    await expect(parseSource({ kind: "markdown", content: markdown })).resolves.toMatchObject({
      normalizedMarkdown: markdown,
    });
  });

  it("hashes the normalized UTF-8 bytes with a 32-byte lowercase SHA-256", async () => {
    await expect(parseSource({ kind: "text", content: "abc" })).resolves.toMatchObject({
      contentSha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    });
  });

  it("binds normalized code metadata into a distinct canonical source identity", async () => {
    const first = await parseSource({ kind: "code", content: "const x = 1;", language: "TypeScript", fileLabel: "main.ts", lineBaseline: 1 });
    const second = await parseSource({ kind: "code", content: "const x = 1;", language: "typescript", fileLabel: "main.ts", lineBaseline: 2 });

    expect(first.contentSha256).toBe(second.contentSha256);
    expect(first.sourceIdentitySha256).not.toBe(second.sourceIdentitySha256);
    expect(first.codeMetadata?.language).toBe("typescript");
  });

  it("accepts exactly 128 KiB and rejects one additional UTF-8 byte", async () => {
    await expect(parseSource({ kind: "text", content: "a".repeat(128 * 1024) })).resolves.toMatchObject({
      parserVersion: "m1-v1",
    });
    await expect(parseSource({ kind: "text", content: "a".repeat(128 * 1024 + 1) }))
      .rejects.toMatchObject({ code: "SOURCE_TOO_LARGE", status: 400 });
  });

  it("applies the 128 KiB limit to normalized Markdown bytes for every M1 source kind", async () => {
    const limit = 128 * 1024;

    await expect(parseSource({
      kind: "text",
      content: `!${"a".repeat(limit - 1)}`,
    })).rejects.toMatchObject({ code: "SOURCE_TOO_LARGE", status: 400 });
    await expect(parseSource({
      kind: "markdown",
      content: "a".repeat(limit),
    })).rejects.toMatchObject({ code: "SOURCE_TOO_LARGE", status: 400 });
    await expect(parseSource({
      kind: "code",
      content: "a".repeat(limit),
    })).rejects.toMatchObject({ code: "SOURCE_TOO_LARGE", status: 400 });

    await expect(parseSource({
      kind: "markdown",
      content: `${"a".repeat(limit - 1)}\n`,
    })).resolves.toMatchObject({ normalizedMarkdown: `${"a".repeat(limit - 1)}\n` });
    await expect(parseSource({
      kind: "code",
      content: `${"a".repeat(limit - 18)}\n`,
    })).resolves.toMatchObject({ parserVersion: "m1-v1" });
  });

  it.each([
    ["NUL", "before\0after"],
    ["unpaired high surrogate", "before\ud800after"],
    ["unpaired low surrogate", "before\udc00after"],
  ])("rejects %s instead of hashing replacement text", async (_label, content) => {
    await expect(parseSource({ kind: "text", content }))
      .rejects.toMatchObject({ code: "SOURCE_METADATA_INVALID", status: 400 });
  });

  it("rejects whitespace-only text and Markdown before chunking", async () => {
    await expect(parseSource({ kind: "text", content: " \t\r\n" }))
      .rejects.toMatchObject({ code: "SOURCE_EMPTY", status: 400 });
    await expect(parseSource({ kind: "markdown", content: " \t\r\n" }))
      .rejects.toMatchObject({ code: "SOURCE_EMPTY", status: 400 });
  });

  it.each([
    ["ordinary whitespace", " \t\r\n"],
    ["oversized-line whitespace", " ".repeat(1_201)],
  ])("rejects %s code before source persistence", async (_label, content) => {
    await expect(parseSource({ kind: "code", content, language: "plaintext" }))
      .rejects.toMatchObject({ code: "SOURCE_EMPTY", status: 400 });
  });
});
