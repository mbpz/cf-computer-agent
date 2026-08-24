// @vitest-environment node
import { describe, expect, it } from "vitest";
import { recoverCsvMarkdown } from "../../src/assets/csv";

describe("CSV recovery", () => {
  it("detects comma-delimited quoted fields and emits a bounded range", async () => {
    expect(recoverCsvMarkdown(new TextEncoder().encode("\uFEFFName,Note\nAlice,\"a,b\"\n").buffer)).toEqual({
      markdown: "## CSV (A1:B2)\n\n| Name | Note |\n| --- | --- |\n| Alice | a,b |\n",
      warnings: [],
    });
  });

  it("supports semicolon and tab delimiters without treating quoted separators as columns", async () => {
    expect(recoverCsvMarkdown(new TextEncoder().encode("Name;Value\nA;1\n").buffer)).toMatchObject({ markdown: expect.stringContaining("A1:B2") });
    expect(recoverCsvMarkdown(new TextEncoder().encode("Name\tValue\nA\t1\n").buffer)).toMatchObject({ markdown: expect.stringContaining("A1:B2") });
  });

  it("rejects malformed quoting, invalid UTF-8 and empty input with stable errors", async () => {
    expect(() => recoverCsvMarkdown(new TextEncoder().encode("Name,Note\n\"unterminated\n").buffer)).toThrowError(expect.objectContaining({ code: "ASSET_CSV_PARSE_UNSUPPORTED", status: 422 }));
    expect(() => recoverCsvMarkdown(Uint8Array.from([0xff]).buffer)).toThrowError(expect.objectContaining({ code: "ASSET_CONTENT_INVALID", status: 422 }));
    expect(() => recoverCsvMarkdown(new ArrayBuffer(0))).toThrowError(expect.objectContaining({ code: "ASSET_CSV_EMPTY", status: 422 }));
  });
});
