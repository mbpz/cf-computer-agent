// @vitest-environment node
import { describe, expect, it } from "vitest";
import { recoverOpenDocumentMarkdown } from "../../src/assets/odf";

describe("OpenDocument recovery", () => {
  it("recovers ODT headings, paragraphs and lists from content.xml", async () => {
    const xml = `<office:document-content><office:body><office:text><text:h text:outline-level="1">Guide</text:h><text:p>Readable body.</text:p><text:list><text:list-item><text:p>One</text:p></text:list-item></text:list></office:text></office:body></office:document-content>`;
    await expect(recoverOpenDocumentMarkdown(await zipEntry(xml), "odt")).resolves.toEqual({
      markdown: "# Guide\n\nReadable body.\n\n- One\n",
      warnings: [],
    });
  });

  it("recovers ODS sheets, repeated cells and A1 range", async () => {
    const xml = `<office:document-content><office:body><office:spreadsheet><table:table table:name="Sales"><table:table-row><table:table-cell office:value-type="string"><text:p>Name</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Value</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell office:value-type="string" table:number-columns-repeated="2"><text:p>A</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`;
    await expect(recoverOpenDocumentMarkdown(await zipEntry(xml), "ods")).resolves.toMatchObject({
      markdown: expect.stringContaining("## Sheet: Sales (A1:B2)"),
      warnings: [],
    });
  });

  it("fails closed for Numbers IWA and malformed OpenDocument containers", async () => {
    await expect(recoverOpenDocumentMarkdown(await zipEntry("binary", "Index/Document.iwa"), "numbers"))
      .rejects.toMatchObject({ code: "ASSET_NUMBERS_PARSE_UNSUPPORTED", status: 422 });
    await expect(recoverOpenDocumentMarkdown(await zipEntry("<bad/>", "wrong.xml"), "odt"))
      .rejects.toMatchObject({ code: "ASSET_ODF_PARSE_UNSUPPORTED", status: 422 });
  });
});

async function zipEntry(content: string, name = "content.xml"): Promise<ArrayBuffer> {
  const nameBytes = new TextEncoder().encode(name); const data = new TextEncoder().encode(content);
  const local = new Uint8Array(30 + nameBytes.length + data.length); const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, nameBytes.length, true); local.set(nameBytes, 30); local.set(data, 30 + nameBytes.length);
  const central = new Uint8Array(46 + nameBytes.length); const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nameBytes.length, true); central.set(nameBytes, 46);
  const end = new Uint8Array(22); const ev = new DataView(end.buffer); ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true); ev.setUint32(12, central.length, true); ev.setUint32(16, local.length, true);
  const result = new Uint8Array(local.length + central.length + end.length); result.set(local, 0); result.set(central, local.length); result.set(end, local.length + central.length); return result.buffer;
}
