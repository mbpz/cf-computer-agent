// @vitest-environment node
import { describe, expect, it } from "vitest";
import { APP_CONFIG } from "../../src/config";
import { recoverCsvMarkdown } from "../../src/assets/csv";
import { recoverDocxMarkdown } from "../../src/assets/docx";
import { recoverHtmlMarkdown } from "../../src/assets/html";
import { recoverOpenDocumentMarkdown } from "../../src/assets/odf";
import { recoverPdfMarkdown } from "../../src/assets/pdf-pages";
import { recoverPptxMarkdown } from "../../src/assets/pptx";
import { recoverXmlMarkdown } from "../../src/assets/xml";
import { recoverXlsxMarkdown } from "../../src/assets/xlsx";
import { parseSource } from "../../src/sources/parser";

type ParserCase = {
  format: string;
  normal: () => Promise<unknown>;
  malformed: () => Promise<unknown>;
  empty: () => Promise<unknown>;
  oversized: () => Promise<unknown>;
  malformedCode: string;
  emptyCode: string;
  oversizedCode: string;
};

const bytes = (value: string): ArrayBuffer => new TextEncoder().encode(value).buffer;
const empty = (): ArrayBuffer => new ArrayBuffer(0);
const oversized = (limit: number): ArrayBuffer => new ArrayBuffer(limit + 1);

describe("M2 format parser matrix", () => {
  it.each(parserCases())("$format accepts normal input and rejects malformed, empty, and oversized input", async (fixture) => {
    const normal = await fixture.normal();
    expect(normal).toBeTruthy();

    await expect(fixture.malformed()).rejects.toMatchObject({ code: fixture.malformedCode });
    await expect(fixture.empty()).rejects.toMatchObject({ code: fixture.emptyCode });
    await expect(fixture.oversized()).rejects.toMatchObject({ code: fixture.oversizedCode });
  });

  it("keeps Numbers as an explicit free-tier degradation", async () => {
    await expect(recoverOpenDocumentMarkdown(bytes("binary"), "numbers"))
      .rejects.toMatchObject({ code: "ASSET_NUMBERS_PARSE_UNSUPPORTED", status: 422 });
  });
});

function parserCases(): ParserCase[] {
  const sourceLimit = APP_CONFIG.maxParsedAssetOutputBytes;
  const pdf = `%PDF-1.4\n1 0 obj\n<< /Type /Page /Contents 2 0 R >>\nendobj\n2 0 obj\n<< /Length 20 >>\nstream\nBT\n(Readable) Tj\nET\nendstream\nendobj\n%%EOF`;
  const docx = zip({
    "word/document.xml": `<w:document><w:body><w:p><w:r><w:t>Readable</w:t></w:r></w:p></w:body></w:document>`,
  });
  const xlsx = zip({
    "xl/workbook.xml": `<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Readable</t></is></c></row></sheetData></worksheet>`,
  });
  const pptx = zip({
    "ppt/presentation.xml": `<p:presentation><p:sldIdLst><p:sldId id="1" r:id="rId1"/></p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>`,
    "ppt/slides/slide1.xml": `<p:sld><a:p><a:r><a:t>Readable</a:t></a:r></a:p></p:sld>`,
  });
  const odt = zip({
    "content.xml": `<office:document-content><office:body><office:text><text:p>Readable</text:p></office:text></office:body></office:document-content>`,
  });
  const ods = zip({
    "content.xml": `<office:document-content><office:body><office:spreadsheet><table:table table:name="Sheet1"><table:table-row><table:table-cell><text:p>Readable</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`,
  });
  return [
    {
      format: "TXT",
      normal: () => parseSource({ kind: "text", content: "Readable text" }),
      malformed: () => parseSource({ kind: "text", content: "invalid\0text" }),
      empty: () => parseSource({ kind: "text", content: "" }),
      oversized: () => parseSource({ kind: "text", content: "a".repeat(sourceLimit + 1) }),
      malformedCode: "SOURCE_METADATA_INVALID", emptyCode: "SOURCE_EMPTY", oversizedCode: "SOURCE_TOO_LARGE",
    },
    {
      format: "Markdown",
      normal: () => parseSource({ kind: "markdown", content: "# Readable\n\nBody" }),
      malformed: () => parseSource({ kind: "markdown", content: "<script>secret</script>" }),
      empty: () => parseSource({ kind: "markdown", content: "" }),
      oversized: () => parseSource({ kind: "markdown", content: "a".repeat(sourceLimit + 1) }),
      malformedCode: "SOURCE_METADATA_INVALID", emptyCode: "SOURCE_EMPTY", oversizedCode: "SOURCE_TOO_LARGE",
    },
    {
      format: "Code",
      normal: () => parseSource({ kind: "code", content: "const value = 1;", language: "typescript", fileLabel: "example.ts" }),
      malformed: () => parseSource({ kind: "code", content: "const value = 1;", language: "brainfuck" }),
      empty: () => parseSource({ kind: "code", content: "" }),
      oversized: () => parseSource({ kind: "code", content: "a".repeat(sourceLimit + 1) }),
      malformedCode: "SOURCE_METADATA_INVALID", emptyCode: "SOURCE_EMPTY", oversizedCode: "SOURCE_TOO_LARGE",
    },
    {
      format: "CSV",
      normal: async () => recoverCsvMarkdown(bytes("Name,Value\nReadable,1\n")),
      malformed: async () => recoverCsvMarkdown(bytes("Name,Value\n\"unterminated\n")),
      empty: async () => recoverCsvMarkdown(empty()),
      oversized: async () => recoverCsvMarkdown(oversized(APP_CONFIG.maxCsvParseBytes)),
      malformedCode: "ASSET_CSV_PARSE_UNSUPPORTED", emptyCode: "ASSET_CSV_EMPTY", oversizedCode: "ASSET_CSV_TOO_LARGE",
    },
    {
      format: "HTML",
      normal: async () => recoverHtmlMarkdown(bytes("<h1>Readable</h1><p>Body</p>")),
      malformed: async () => recoverHtmlMarkdown(Uint8Array.from([0xff]).buffer),
      empty: async () => recoverHtmlMarkdown(empty()),
      oversized: async () => recoverHtmlMarkdown(oversized(APP_CONFIG.maxHtmlParseBytes)),
      malformedCode: "ASSET_CONTENT_INVALID", emptyCode: "ASSET_HTML_EMPTY", oversizedCode: "ASSET_HTML_TOO_LARGE",
    },
    {
      format: "XML",
      normal: async () => recoverXmlMarkdown(bytes("<root><item>Readable</item></root>")),
      malformed: async () => recoverXmlMarkdown(bytes("<root><item></root>")),
      empty: async () => recoverXmlMarkdown(empty()),
      oversized: async () => recoverXmlMarkdown(oversized(APP_CONFIG.maxXmlParseBytes)),
      malformedCode: "ASSET_XML_PARSE_UNSUPPORTED", emptyCode: "ASSET_XML_EMPTY", oversizedCode: "ASSET_XML_TOO_LARGE",
    },
    {
      format: "PDF",
      normal: async () => recoverPdfMarkdown(bytes(pdf)),
      malformed: async () => recoverPdfMarkdown(bytes("not a PDF")),
      empty: async () => recoverPdfMarkdown(empty()),
      oversized: async () => recoverPdfMarkdown(oversized(APP_CONFIG.maxPdfParseBytes)),
      malformedCode: "ASSET_CONTENT_INVALID", emptyCode: "ASSET_CONTENT_INVALID", oversizedCode: "ASSET_PDF_TOO_LARGE",
    },
    {
      format: "DOCX",
      normal: async () => recoverDocxMarkdown(docx),
      malformed: async () => recoverDocxMarkdown(Uint8Array.from([1, 2, 3]).buffer),
      empty: async () => recoverDocxMarkdown(empty()),
      oversized: async () => recoverDocxMarkdown(oversized(APP_CONFIG.maxDocxParseBytes)),
      malformedCode: "ASSET_DOCX_PARSE_UNSUPPORTED", emptyCode: "ASSET_CONTENT_INVALID", oversizedCode: "ASSET_DOCX_TOO_LARGE",
    },
    {
      format: "XLSX",
      normal: async () => recoverXlsxMarkdown(xlsx),
      malformed: async () => recoverXlsxMarkdown(Uint8Array.from([1, 2, 3]).buffer),
      empty: async () => recoverXlsxMarkdown(empty()),
      oversized: async () => recoverXlsxMarkdown(oversized(APP_CONFIG.maxXlsxParseBytes)),
      malformedCode: "ASSET_XLSX_PARSE_UNSUPPORTED", emptyCode: "ASSET_CONTENT_INVALID", oversizedCode: "ASSET_XLSX_TOO_LARGE",
    },
    {
      format: "ODT",
      normal: async () => recoverOpenDocumentMarkdown(odt, "odt"),
      malformed: async () => recoverOpenDocumentMarkdown(Uint8Array.from([1, 2, 3]).buffer, "odt"),
      empty: async () => recoverOpenDocumentMarkdown(empty(), "odt"),
      oversized: async () => recoverOpenDocumentMarkdown(oversized(APP_CONFIG.maxOdfParseBytes), "odt"),
      malformedCode: "ASSET_ODF_PARSE_UNSUPPORTED", emptyCode: "ASSET_ODF_EMPTY", oversizedCode: "ASSET_ODF_TOO_LARGE",
    },
    {
      format: "ODS",
      normal: async () => recoverOpenDocumentMarkdown(ods, "ods"),
      malformed: async () => recoverOpenDocumentMarkdown(Uint8Array.from([1, 2, 3]).buffer, "ods"),
      empty: async () => recoverOpenDocumentMarkdown(empty(), "ods"),
      oversized: async () => recoverOpenDocumentMarkdown(oversized(APP_CONFIG.maxOdfParseBytes), "ods"),
      malformedCode: "ASSET_ODF_PARSE_UNSUPPORTED", emptyCode: "ASSET_ODF_EMPTY", oversizedCode: "ASSET_ODF_TOO_LARGE",
    },
    {
      format: "PPTX",
      normal: async () => recoverPptxMarkdown(pptx),
      malformed: async () => recoverPptxMarkdown(Uint8Array.from([1, 2, 3]).buffer),
      empty: async () => recoverPptxMarkdown(empty()),
      oversized: async () => recoverPptxMarkdown(oversized(APP_CONFIG.maxPptxParseBytes)),
      malformedCode: "ASSET_PPTX_PARSE_UNSUPPORTED", emptyCode: "ASSET_PPTX_EMPTY", oversizedCode: "ASSET_PPTX_TOO_LARGE",
    },
  ];
}

function zip(entries: Record<string, string>): ArrayBuffer {
  const encoded = Object.entries(entries).map(([name, value]) => ({ name: new TextEncoder().encode(name), data: new TextEncoder().encode(value) }));
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of encoded) {
    const local = new Uint8Array(30 + entry.name.length + entry.data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(26, entry.name.length, true);
    localView.setUint32(18, entry.data.length, true); localView.setUint32(22, entry.data.length, true);
    local.set(entry.name, 30); local.set(entry.data, 30 + entry.name.length); locals.push(local);

    const central = new Uint8Array(46 + entry.name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true);
    centralView.setUint32(20, entry.data.length, true); centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, entry.name.length, true); centralView.setUint32(42, offset, true);
    central.set(entry.name, 46); centrals.push(central); offset += local.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22); const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, encoded.length, true); endView.setUint16(10, encoded.length, true);
  endView.setUint32(12, centralSize, true); endView.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + end.length); let cursor = 0;
  for (const local of locals) { result.set(local, cursor); cursor += local.length; }
  for (const central of centrals) { result.set(central, cursor); cursor += central.length; }
  result.set(end, cursor); return result.buffer;
}
