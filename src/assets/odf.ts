import { APP_CONFIG } from "../config";
import { AppError } from "../http";

export type OpenDocumentFormat = "odt" | "ods" | "numbers";
export interface RecoveredOpenDocumentMarkdown { markdown: string; warnings: string[] }
type ZipEntry = { bytes: Uint8Array; size: number };

export async function recoverOpenDocumentMarkdown(bytes: ArrayBuffer, format: OpenDocumentFormat): Promise<RecoveredOpenDocumentMarkdown> {
  if (format === "numbers") throw new AppError("ASSET_NUMBERS_PARSE_UNSUPPORTED", "Numbers IWA is not supported in the free local parser", 422);
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) throw new AppError("ASSET_ODF_EMPTY", "OpenDocument is empty", 422);
  if (bytes.byteLength > APP_CONFIG.maxOdfParseBytes) throw new AppError("ASSET_ODF_TOO_LARGE", "OpenDocument parsing input exceeds the limit", 413);
  const entry = await readZipEntry(bytes, "content.xml");
  if (!entry) throw new AppError("ASSET_ODF_PARSE_UNSUPPORTED", "OpenDocument content.xml is unavailable", 422);
  let xml: string;
  try { xml = new TextDecoder("utf-8", { fatal: true }).decode(entry.bytes); }
  catch { throw new AppError("ASSET_CONTENT_INVALID", "Asset content encoding is invalid", 422); }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(xml)) throw new AppError("ASSET_ODF_PARSE_UNSUPPORTED", "OpenDocument declarations are unsupported", 422);
  const markdown = format === "odt" ? renderOdt(xml) : renderOds(xml);
  if (!markdown.trim()) throw new AppError("ASSET_ODF_EMPTY", "OpenDocument has no readable content", 422);
  if (new TextEncoder().encode(markdown).byteLength > APP_CONFIG.maxOdfOutputBytes) throw new AppError("ASSET_ODF_OUTPUT_TOO_LARGE", "OpenDocument output exceeds the limit", 422);
  return { markdown: `${markdown.trim()}\n`, warnings: [] };
}

function renderOdt(xml: string): string {
  const blocks: string[] = [];
  const withoutLists = xml.replace(/<text:list\b[^>]*>[\s\S]*?<\/text:list>/giu, "");
  for (const match of withoutLists.matchAll(/<(text:h|text:p)\b([^>]*)>([\s\S]*?)<\/\1>/giu)) {
    const value = textValue(match[3] ?? ""); if (!value) continue;
    const level = match[1]!.toLowerCase() === "text:h" ? Math.min(6, Math.max(1, Number(attribute(match[2] ?? "", "text:outline-level") || 1))) : 0;
    blocks.push(level ? `${"#".repeat(level)} ${value}` : value);
  }
  for (const match of xml.matchAll(/<text:list-item\b[^>]*>[\s\S]*?<text:p\b[^>]*>([\s\S]*?)<\/text:p>[\s\S]*?<\/text:list-item>/giu)) {
    const value = textValue(match[1] ?? ""); if (value) blocks.push(`- ${value}`);
  }
  return blocks.join("\n\n");
}

function renderOds(xml: string): string {
  const blocks: string[] = [];
  for (const table of xml.matchAll(/<table:table\b([^>]*)>([\s\S]*?)<\/table:table>/giu)) {
    const name = attribute(table[1] ?? "", "table:name") || "Sheet"; const rows: string[][] = [];
    for (const row of (table[2] ?? "").matchAll(/<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/giu)) {
      const cells: string[] = [];
      for (const cell of (row[1] ?? "").matchAll(/<table:table-cell\b([^>]*)>([\s\S]*?)<\/table:table-cell>/giu)) {
        const value = textValue(cell[2] ?? ""); const repeat = Math.min(256, Math.max(1, Number(attribute(cell[1] ?? "", "table:number-columns-repeated") || 1)));
        for (let index = 0; index < repeat; index += 1) cells.push(value);
      }
      if (cells.length) rows.push(cells);
      if (rows.length > APP_CONFIG.maxOdfRows) throw new AppError("ASSET_ODF_TOO_LARGE", "OpenDocument row count exceeds the limit", 413);
    }
    if (!rows.length) continue;
    const width = Math.max(...rows.map((row) => row.length)); const padded = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")]);
    const range = `A1:${columnName(width)}${padded.length}`; const header = padded[0]!;
    blocks.push([`## Sheet: ${safeText(name)} (${range})`, `| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...padded.slice(1).map((row) => `| ${row.join(" | ")} |`)].join("\n\n"));
  }
  return blocks.join("\n\n");
}

function textValue(xml: string): string {
  const paragraphs = [...xml.matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/giu)].map((match) => decodeEntities(stripTags(match[1] ?? "")));
  return (paragraphs.length ? paragraphs : [decodeEntities(stripTags(xml))]).join(" ").trim();
}
function stripTags(value: string): string { return value.replace(/<[^>]+>/gu, ""); }
function attribute(attrs: string, name: string): string | null { return new RegExp(`(?:^|\\s)${name.replace(":", ":")}\\s*=\\s*["']([^"']*)["']`, "iu").exec(attrs)?.[1] ?? null; }
function safeText(value: string): string { return decodeEntities(value).replace(/[\r\n#]/gu, " ").trim() || "Sheet"; }
function decodeEntities(value: string): string { return value.replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|[0-9]+);/giu, (entity) => { const named: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" }; if (named[entity]) return named[entity]; const code = entity.startsWith("&#x") || entity.startsWith("&#X") ? Number.parseInt(entity.slice(3, -1), 16) : Number.parseInt(entity.slice(2, -1), 10); return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""; }); }
function columnName(value: number): string { let result = ""; for (let current = value; current > 0; current = Math.floor((current - 1) / 26)) result = String.fromCharCode(65 + ((current - 1) % 26)) + result; return result; }

async function readZipEntry(bytes: ArrayBuffer, wanted: string): Promise<ZipEntry | null> {
  const view = new DataView(bytes); const end = findEnd(view); if (end < 0) throw new AppError("ASSET_ODF_PARSE_UNSUPPORTED", "OpenDocument container is invalid", 422);
  const centralSize = view.getUint32(end + 12, true); const centralOffset = view.getUint32(end + 16, true); const count = view.getUint16(end + 10, true);
  if (!bounded(centralOffset, centralSize, bytes.byteLength) || count > 256) throw new AppError("ASSET_ODF_PARSE_UNSUPPORTED", "OpenDocument directory is invalid", 422);
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (!bounded(cursor, 46, bytes.byteLength) || view.getUint32(cursor, true) !== 0x02014b50) throw new AppError("ASSET_ODF_PARSE_UNSUPPORTED", "OpenDocument directory is invalid", 422);
    const method = view.getUint16(cursor + 10, true); const compressed = view.getUint32(cursor + 20, true); const size = view.getUint32(cursor + 24, true); const nameLength = view.getUint16(cursor + 28, true); const extra = view.getUint16(cursor + 30, true); const comment = view.getUint16(cursor + 32, true); const local = view.getUint32(cursor + 42, true); const nameStart = cursor + 46;
    if (!bounded(nameStart, nameLength, bytes.byteLength)) throw new AppError("ASSET_ODF_PARSE_UNSUPPORTED", "OpenDocument directory is invalid", 422);
    const name = new TextDecoder().decode(new Uint8Array(bytes, nameStart, nameLength));
    if (name === wanted) {
      if (size > APP_CONFIG.maxOdfXmlBytes || !bounded(local, 30, bytes.byteLength)) throw new AppError("ASSET_ODF_TOO_LARGE", "OpenDocument XML exceeds the limit", 413);
      const localName = view.getUint16(local + 26, true); const localExtra = view.getUint16(local + 28, true); const dataOffset = local + 30 + localName + localExtra;
      if (!bounded(dataOffset, compressed, bytes.byteLength)) throw new AppError("ASSET_ODF_PARSE_UNSUPPORTED", "OpenDocument entry is invalid", 422);
      const data = new Uint8Array(bytes, dataOffset, compressed);
      if (method === 0) return { bytes: data.slice(), size };
      if (method !== 8) throw new AppError("ASSET_ODF_PARSE_UNSUPPORTED", "OpenDocument compression is unsupported", 422);
      try { const stream = new DecompressionStream("deflate-raw"); const writer = stream.writable.getWriter(); await writer.write(data); await writer.close(); const result = new Uint8Array(await new Response(stream.readable).arrayBuffer()); if (result.byteLength > APP_CONFIG.maxOdfXmlBytes) throw new AppError("ASSET_ODF_TOO_LARGE", "OpenDocument XML exceeds the limit", 413); return { bytes: result, size: result.byteLength }; }
      catch (error) { if (error instanceof AppError) throw error; throw new AppError("ASSET_ODF_PARSE_UNSUPPORTED", "OpenDocument compression is invalid", 422); }
    }
    cursor += 46 + nameLength + extra + comment;
  }
  return null;
}
function findEnd(view: DataView): number { for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 65_557); offset -= 1) if (view.getUint32(offset, true) === 0x06054b50) return offset; return -1; }
function bounded(offset: number, length: number, total: number): boolean { return Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 && length >= 0 && offset + length <= total; }
