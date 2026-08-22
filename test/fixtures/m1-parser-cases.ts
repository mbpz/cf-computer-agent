export interface ParserCase {
  id: string;
  kind: "text" | "markdown" | "code";
  bytes: Uint8Array;
  metadata?: { language?: string; fileLabel?: string; lineBaseline?: number };
  expected:
    | { ok: true; markdown: string; lineCount: number; warnings: string[] }
    | { ok: false; code: "SOURCE_ENCODING_INVALID" | "SOURCE_EMPTY" | "SOURCE_TOO_LARGE" | "SOURCE_METADATA_INVALID" };
}

const encoder = new TextEncoder();
const bytes = (value: string): Uint8Array => encoder.encode(value);
const malformedUtf8 = new Uint8Array([0xc3, 0x28]);
const limit = 128 * 1024;

/** Independent byte fixtures: never derive expectations through parser helpers. */
export const m1ParserCases: readonly ParserCase[] = [
  { id: "text-normal", kind: "text", bytes: bytes("alpha\r\nbeta"), expected: { ok: true, markdown: "alpha\nbeta", lineCount: 2, warnings: [] } },
  { id: "text-empty", kind: "text", bytes: bytes(" \t\r\n"), expected: { ok: false, code: "SOURCE_EMPTY" } },
  { id: "text-exact", kind: "text", bytes: bytes("a".repeat(limit)), expected: { ok: true, markdown: "a".repeat(limit), lineCount: 1, warnings: [] } },
  { id: "text-over-limit", kind: "text", bytes: bytes("a".repeat(limit + 1)), expected: { ok: false, code: "SOURCE_TOO_LARGE" } },
  { id: "text-malformed-utf8", kind: "text", bytes: malformedUtf8, expected: { ok: false, code: "SOURCE_ENCODING_INVALID" } },
  { id: "text-malicious", kind: "text", bytes: bytes("[x](javascript:alert(1))"), expected: { ok: true, markdown: "\\[x\\]\\(javascript\\:alert\\(1\\)\\)", lineCount: 1, warnings: [] } },
  { id: "text-newline", kind: "text", bytes: bytes("a\rb\r\nc"), expected: { ok: true, markdown: "a\nb\nc", lineCount: 3, warnings: [] } },

  { id: "markdown-normal", kind: "markdown", bytes: bytes("# Alpha\r\n\r\nBody  "), expected: { ok: true, markdown: "# Alpha\n\nBody\n", lineCount: 3, warnings: [] } },
  { id: "markdown-empty", kind: "markdown", bytes: bytes(" \t\r\n"), expected: { ok: false, code: "SOURCE_EMPTY" } },
  { id: "markdown-exact", kind: "markdown", bytes: bytes("a".repeat(limit - 1)), expected: { ok: true, markdown: "a".repeat(limit - 1) + "\n", lineCount: 1, warnings: [] } },
  { id: "markdown-over-limit", kind: "markdown", bytes: bytes("a".repeat(limit)), expected: { ok: false, code: "SOURCE_TOO_LARGE" } },
  { id: "markdown-malformed-utf8", kind: "markdown", bytes: malformedUtf8, expected: { ok: false, code: "SOURCE_ENCODING_INVALID" } },
  { id: "markdown-malicious", kind: "markdown", bytes: bytes("<img src=x onerror=alert(1)>"), expected: { ok: false, code: "SOURCE_METADATA_INVALID" } },
  { id: "markdown-newline", kind: "markdown", bytes: bytes("A\rB\r\n"), expected: { ok: true, markdown: "A\nB\n", lineCount: 2, warnings: [] } },

  { id: "code-normal", kind: "code", bytes: bytes("const x = 1;\r\n"), metadata: { language: "typescript", fileLabel: "main.ts", lineBaseline: 40 }, expected: { ok: true, markdown: "```typescript\nconst x = 1;\n```\n", lineCount: 3, warnings: [] } },
  { id: "code-empty", kind: "code", bytes: bytes(" \t\r\n"), metadata: { language: "typescript", fileLabel: "main.ts", lineBaseline: 1 }, expected: { ok: false, code: "SOURCE_EMPTY" } },
  { id: "code-exact", kind: "code", bytes: bytes("a".repeat(limit - 11)), metadata: { language: "go", fileLabel: "main.go", lineBaseline: 1 }, expected: { ok: true, markdown: "```go\n" + "a".repeat(limit - 11) + "\n```\n", lineCount: 3, warnings: [] } },
  { id: "code-over-limit", kind: "code", bytes: bytes("a".repeat(limit)), metadata: { language: "go", fileLabel: "main.go", lineBaseline: 1 }, expected: { ok: false, code: "SOURCE_TOO_LARGE" } },
  { id: "code-malformed-utf8", kind: "code", bytes: malformedUtf8, metadata: { language: "rust", fileLabel: "main.rs", lineBaseline: 1 }, expected: { ok: false, code: "SOURCE_ENCODING_INVALID" } },
  { id: "code-malicious-metadata", kind: "code", bytes: bytes("alert(1)"), metadata: { language: "javascript", fileLabel: "../secret.js", lineBaseline: 1 }, expected: { ok: false, code: "SOURCE_METADATA_INVALID" } },
  { id: "code-newline", kind: "code", bytes: bytes("a\rb\r\nc"), metadata: { language: "python", fileLabel: "main.py", lineBaseline: 7 }, expected: { ok: true, markdown: "```python\na\nb\nc\n```\n", lineCount: 5, warnings: [] } },
];
