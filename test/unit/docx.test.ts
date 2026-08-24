// @vitest-environment node
import { describe, expect, it } from "vitest";
import { recoverDocxMarkdown } from "../../src/assets/docx";

describe("DOCX recovery", () => {
  it("preserves heading, paragraph and table order", async () => {
    const xml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Overview</w:t></w:r></w:p>
      <w:p><w:r><w:t>Readable </w:t></w:r><w:r><w:t>body.</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr>
        <w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    </w:body></w:document>`;

    await expect(recoverDocxMarkdown(await zipEntry(xml))).resolves.toEqual({
      markdown: "# Overview\n\nReadable body.\n\n| Name | Value |\n| --- | --- |\n| A | 1 |\n",
      warnings: [],
    });
  });

  it("reads a deflated document.xml and ignores external entity declarations", async () => {
    const xml = `<!DOCTYPE w:document [<!ENTITY xxe SYSTEM "file:///secret">]><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Safe &amp; known</w:t></w:r></w:p></w:body></w:document>`;
    await expect(recoverDocxMarkdown(await zipEntry(xml, true))).resolves.toMatchObject({
      markdown: "Safe & known\n",
      warnings: [],
    });
  });

  it("rejects a missing document part without exposing XML", async () => {
    await expect(recoverDocxMarkdown(await zipEntry("<not-document/>", false, "word/other.xml")))
      .rejects.toMatchObject({ code: "ASSET_DOCX_PARSE_UNSUPPORTED", status: 422 });
  });
});

async function zipEntry(xml: string, deflate = false, name = "word/document.xml"): Promise<ArrayBuffer> {
  const nameBytes = new TextEncoder().encode(name);
  const source = new TextEncoder().encode(xml);
  let payload = source;
  let method = 0;
  if (deflate) {
    const stream = new CompressionStream("deflate-raw");
    const writer = stream.writable.getWriter();
    await writer.write(source);
    await writer.close();
    payload = new Uint8Array(await new Response(stream.readable).arrayBuffer());
    method = 8;
  }
  const local = new Uint8Array(30 + nameBytes.length + payload.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(8, method, true);
  localView.setUint32(18, payload.length, true);
  localView.setUint32(22, source.length, true);
  localView.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  local.set(payload, 30 + nameBytes.length);

  const central = new Uint8Array(46 + nameBytes.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint16(10, method, true);
  centralView.setUint32(20, payload.length, true);
  centralView.setUint32(24, source.length, true);
  centralView.setUint16(28, nameBytes.length, true);
  centralView.setUint32(42, 0, true);
  central.set(nameBytes, 46);

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, 1, true);
  endView.setUint16(10, 1, true);
  endView.setUint32(12, central.length, true);
  endView.setUint32(16, local.length, true);
  endView.setUint16(20, 0, true);
  const result = new Uint8Array(local.length + central.length + end.length);
  result.set(local);
  result.set(central, local.length);
  result.set(end, local.length + central.length);
  return result.buffer;
}
