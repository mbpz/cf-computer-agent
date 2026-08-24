// @vitest-environment node
import { describe, expect, it } from "vitest";
import { recoverPdfMarkdown } from "../../src/assets/pdf-pages";

const fixture = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 34 >>
stream
BT
(First paragraph) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Page /Parent 2 0 R /Contents 6 0 R >>
endobj
6 0 obj
<< /Length 35 >>
stream
BT
(Second paragraph) Tj
ET
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF`;

describe("PDF page recovery", () => {
  it("recovers text streams with deterministic page headings", () => {
    expect(recoverPdfMarkdown(new TextEncoder().encode(fixture).buffer)).toEqual({
      markdown: "## Page 1\n\nFirst paragraph\n\n## Page 2\n\nSecond paragraph\n",
      pages: [
        { page: 1, text: "First paragraph" },
        { page: 2, text: "Second paragraph" },
      ],
      warnings: [],
    });
  });

  it("marks an otherwise valid page as unknown when no text stream is recoverable", () => {
    const pdf = "%PDF-1.4\n3 0 obj\n<< /Type /Page >>\nendobj\n%%EOF";
    expect(recoverPdfMarkdown(new TextEncoder().encode(pdf).buffer)).toMatchObject({
      markdown: "## Page unknown\n",
      pages: [{ page: "unknown", text: "" }],
      warnings: ["PDF_TEXT_UNAVAILABLE"],
    });
  });

  it("rejects malformed PDF bytes without exposing binary content", () => {
    expect(() => recoverPdfMarkdown(new Uint8Array([0, 255, 1, 2]).buffer)).toThrowError(
      expect.objectContaining({ code: "ASSET_CONTENT_INVALID" }),
    );
  });
});
