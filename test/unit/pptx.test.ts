// @vitest-environment node
import { describe, expect, it } from "vitest";
import { recoverPptxMarkdown } from "../../src/assets/pptx";

describe("PPTX recovery", () => {
  it("preserves slide order, slide numbers and text element order", async () => {
    const presentation = `<p:presentation><p:sldIdLst><p:sldId id="1" r:id="rId1"/><p:sldId id="2" r:id="rId2"/></p:sldIdLst></p:presentation>`;
    const rels = `<Relationships><Relationship Id="rId1" Target="slides/slide2.xml"/><Relationship Id="rId2" Target="slides/slide1.xml"/></Relationships>`;
    const slide1 = `<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Second slide</a:t></a:r></a:p><a:p><a:r><a:t>Later element</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
    const slide2 = `<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>First slide</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
    await expect(recoverPptxMarkdown(await zipEntries({
      "ppt/presentation.xml": presentation,
      "ppt/_rels/presentation.xml.rels": rels,
      "ppt/slides/slide1.xml": slide1,
      "ppt/slides/slide2.xml": slide2,
    }))).resolves.toEqual({
      markdown: "## Slide 1\n\nFirst slide\n\n## Slide 2\n\nSecond slide\n\nLater element\n",
      warnings: [],
    });
  });

  it("rejects external entities, missing slides and empty presentations", async () => {
    await expect(recoverPptxMarkdown(await zipEntries({ "ppt/presentation.xml": "<!DOCTYPE p:presentation [<!ENTITY xxe SYSTEM 'file:///secret'>]><p:presentation/>" })))
      .rejects.toMatchObject({ code: "ASSET_PPTX_PARSE_UNSUPPORTED", status: 422 });
    await expect(recoverPptxMarkdown(await zipEntries({ "ppt/presentation.xml": "<p:presentation/>", "ppt/_rels/presentation.xml.rels": "<Relationships/>" })))
      .rejects.toMatchObject({ code: "ASSET_PPTX_EMPTY", status: 422 });
  });
});

async function zipEntries(entries: Record<string, string>): Promise<ArrayBuffer> {
  const encoded = Object.entries(entries).map(([name, value]) => ({ name: new TextEncoder().encode(name), data: new TextEncoder().encode(value) }));
  const locals: Uint8Array[] = []; const centrals: Uint8Array[] = []; let offset = 0;
  for (const entry of encoded) {
    const local = new Uint8Array(30 + entry.name.length + entry.data.length); const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint32(18, entry.data.length, true); lv.setUint32(22, entry.data.length, true); lv.setUint16(26, entry.name.length, true); local.set(entry.name, 30); local.set(entry.data, 30 + entry.name.length); locals.push(local);
    const central = new Uint8Array(46 + entry.name.length); const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint32(20, entry.data.length, true); cv.setUint32(24, entry.data.length, true); cv.setUint16(28, entry.name.length, true); cv.setUint32(42, offset, true); central.set(entry.name, 46); centrals.push(central); offset += local.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0); const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, encoded.length, true); ev.setUint16(10, encoded.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + end.length); let cursor = 0; for (const item of locals) { result.set(item, cursor); cursor += item.length; } for (const item of centrals) { result.set(item, cursor); cursor += item.length; } result.set(end, cursor); return result.buffer;
}
