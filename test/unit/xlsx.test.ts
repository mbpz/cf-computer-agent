// @vitest-environment node
import { describe, expect, it } from "vitest";
import { recoverXlsxMarkdown } from "../../src/assets/xlsx";

describe("XLSX recovery", () => {
  it("emits each worksheet table with its sheet name and cell range", async () => {
    const workbook = `<?xml version="1.0"?><workbook xmlns="x"><sheets><sheet name="Sales" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/></sheets></workbook>`;
    const relationships = `<Relationships xmlns="x"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`;
    const shared = `<sst xmlns="x"><si><t>Product</t></si><si><t>Amount</t></si></sst>`;
    const sales = `<worksheet xmlns="x"><sheetData><row r="2"><c r="B2" t="n"><v>4</v></c></row><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheetData></worksheet>`;
    const notes = `<worksheet xmlns="x"><sheetData><row r="3"><c r="C3" t="inlineStr"><is><t>Known</t></is></c></row></sheetData></worksheet>`;
    await expect(recoverXlsxMarkdown(await zipEntries({
      "xl/workbook.xml": workbook,
      "xl/_rels/workbook.xml.rels": relationships,
      "xl/sharedStrings.xml": shared,
      "xl/worksheets/sheet1.xml": sales,
      "xl/worksheets/sheet2.xml": notes,
    }))).resolves.toEqual({
      markdown: "## Sheet: Sales (A1:B2)\n\n| Product | Amount |\n| --- | --- |\n|  | 4 |\n\n## Sheet: Notes (C3:C3)\n\n| C |\n| --- |\n| Known |\n",
      warnings: [],
    });
  });

  it("rejects malformed or missing worksheets with stable errors", async () => {
    await expect(recoverXlsxMarkdown(await zipEntries({ "xl/workbook.xml": "<workbook/>" })))
      .rejects.toMatchObject({ code: "ASSET_XLSX_PARSE_UNSUPPORTED", status: 422 });
  });

  it("does not evaluate XML entities or accept a spreadsheet over the bound", async () => {
    const xml = `<!DOCTYPE worksheet [<!ENTITY xxe SYSTEM "file:///secret">]><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&xxe;</t></is></c></row></sheetData></worksheet>`;
    await expect(recoverXlsxMarkdown(await zipEntries({
      "xl/workbook.xml": `<workbook><sheets><sheet name="Safe" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
      "xl/worksheets/sheet1.xml": xml,
    }))).rejects.toMatchObject({ code: "ASSET_XLSX_PARSE_UNSUPPORTED" });
  });
});

async function zipEntries(entries: Record<string, string>): Promise<ArrayBuffer> {
  const encoded = Object.entries(entries).map(([name, value]) => ({ name: new TextEncoder().encode(name), data: new TextEncoder().encode(value) }));
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of encoded) {
    const local = new Uint8Array(30 + entry.name.length + entry.data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(8, 0, true);
    lv.setUint32(18, entry.data.length, true); lv.setUint32(22, entry.data.length, true); lv.setUint16(26, entry.name.length, true);
    local.set(entry.name, 30); local.set(entry.data, 30 + entry.name.length); locals.push(local);
    const central = new Uint8Array(46 + entry.name.length); const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(10, 0, true);
    cv.setUint32(20, entry.data.length, true); cv.setUint32(24, entry.data.length, true); cv.setUint16(28, entry.name.length, true); cv.setUint32(42, offset, true);
    central.set(entry.name, 46); centrals.push(central); offset += local.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, encoded.length, true); ev.setUint16(10, encoded.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + end.length); let cursor = 0;
  for (const local of locals) { result.set(local, cursor); cursor += local.length; }
  for (const central of centrals) { result.set(central, cursor); cursor += central.length; }
  result.set(end, cursor); return result.buffer;
}
