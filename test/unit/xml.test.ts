// @vitest-environment node
import { describe, expect, it } from "vitest";
import { recoverXmlMarkdown } from "../../src/assets/xml";

describe("XML recovery", () => {
  it("renders bounded element hierarchy and leaf values", () => {
    const result = recoverXmlMarkdown(new TextEncoder().encode(`<?xml version="1.0"?><catalog><item><title>One &amp; only</title><summary>Readable text.</summary></item></catalog>`).buffer);
    expect(result).toEqual({
      markdown: "## catalog\n\n### item\n\n- title: One & only\n- summary: Readable text.\n",
      warnings: [],
    });
  });

  it("rejects external entities, mismatched tags and over-deep documents", () => {
    expect(() => recoverXmlMarkdown(new TextEncoder().encode(`<!DOCTYPE catalog [<!ENTITY xxe SYSTEM "file:///secret">]><catalog>&xxe;</catalog>`).buffer))
      .toThrowError(expect.objectContaining({ code: "ASSET_XML_PARSE_UNSUPPORTED", status: 422 }));
    expect(() => recoverXmlMarkdown(new TextEncoder().encode("<catalog><item></catalog>").buffer))
      .toThrowError(expect.objectContaining({ code: "ASSET_XML_PARSE_UNSUPPORTED", status: 422 }));
  });

  it("rejects invalid UTF-8 and empty XML with stable errors", () => {
    expect(() => recoverXmlMarkdown(new ArrayBuffer(0))).toThrowError(expect.objectContaining({ code: "ASSET_XML_EMPTY", status: 422 }));
    expect(() => recoverXmlMarkdown(Uint8Array.from([0xff]).buffer)).toThrowError(expect.objectContaining({ code: "ASSET_CONTENT_INVALID", status: 422 }));
  });
});
