// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertReadableParsedMarkdown } from "../../src/assets/empty";

describe("asset empty-document boundary", () => {
  it("rejects blank, non-string and whitespace-only parser output", () => {
    for (const value of ["", " \n\t ", null, undefined, 42]) {
      expect(() => assertReadableParsedMarkdown(value)).toThrowError(expect.objectContaining({ code: "SOURCE_EMPTY", status: 400 }));
    }
  });

  it("accepts readable parser output", () => {
    expect(() => assertReadableParsedMarkdown("## Content\n\nBody\n")).not.toThrow();
  });
});
