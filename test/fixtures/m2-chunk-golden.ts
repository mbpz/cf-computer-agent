import type { ParseSourceInput } from "../../src/sources/types";

export const M2_CHUNK_GOLDEN_CASES = [
  {
    id: "heading",
    input: { kind: "markdown", content: "# Guide\n\nA durable paragraph.\n" } satisfies ParseSourceInput,
    expected: { headingPath: ["Guide"], startLine: 3, endLine: 3, indexField: "body" },
  },
  {
    id: "table",
    input: { kind: "markdown", content: "## Sheet: Sales (A1:B2)\n\n| Product | Amount |\n| --- | --- |\n| Tea | 4 |\n" } satisfies ParseSourceInput,
    expected: { location: { kind: "spreadsheet", sheet: "Sales", range: "A1:B2" }, indexField: "body" },
  },
  {
    id: "code",
    input: { kind: "code", content: "const answer = 42;\n", language: "typescript", fileLabel: "answer.ts", lineBaseline: 12 } satisfies ParseSourceInput,
    expected: { indexField: "code", startLine: 12, endLine: 12 },
  },
  {
    id: "pdf-location",
    input: { kind: "markdown", content: "## Page 4\n\nA page-bound fact.\n" } satisfies ParseSourceInput,
    expected: { location: { kind: "pdf", page: 4 } },
  },
  {
    id: "slide-location",
    input: { kind: "markdown", content: "## Slide 2\n\nTitle\n\nBody\n" } satisfies ParseSourceInput,
    expected: { location: { kind: "slide", slide: 2, elementStart: 1, elementEnd: 1 } },
  },
] as const;
