import { APP_CONFIG } from "../config";
import { AppError } from "../http";

export interface RecoveredXlsxMarkdown {
  markdown: string;
  warnings: string[];
}

type ZipEntry = { bytes: Uint8Array; uncompressedSize: number };
type Cell = { row: number; column: number; value: string };

/**
 * Small, bounded OOXML reader for XLSX workbooks. It intentionally reads only
 * workbook relationships, shared strings, and worksheet XML; no XML parser is
 * allowed to resolve entities or fetch external resources.
 */
export async function recoverXlsxMarkdown(bytes: ArrayBuffer): Promise<RecoveredXlsxMarkdown> {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) {
    throw new AppError("ASSET_CONTENT_INVALID", "Asset content is invalid", 422);
  }
  if (bytes.byteLength > APP_CONFIG.maxXlsxParseBytes) {
    throw new AppError("ASSET_XLSX_TOO_LARGE", "XLSX parsing input exceeds the limit", 413);
  }
  const workbookXml = await readZipEntry(bytes, "xl/workbook.xml");
  const relsXml = await readZipEntry(bytes, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) {
    throw new AppError("ASSET_XLSX_PARSE_UNSUPPORTED", "XLSX workbook metadata is unavailable", 422);
  }
  const workbook = decodeXml(decodeUtf8(workbookXml));
  const rels = decodeXml(decodeUtf8(relsXml));
  rejectUnsafeXml(workbook);
  rejectUnsafeXml(rels);
  const relationships = parseRelationships(rels);
  const sharedStringsEntry = await readZipEntry(bytes, "xl/sharedStrings.xml");
  const sharedStrings = sharedStringsEntry ? parseSharedStrings(decodeXml(decodeUtf8(sharedStringsEntry))) : [];
  const sheets = parseSheets(workbook);
  if (sheets.length === 0) {
    throw new AppError("ASSET_XLSX_PARSE_UNSUPPORTED", "XLSX contains no worksheets", 422);
  }

  const blocks: string[] = [];
  for (const sheet of sheets.slice(0, APP_CONFIG.maxXlsxSheets)) {
    const target = relationships.get(sheet.relationshipId);
    if (!target) throw new AppError("ASSET_XLSX_PARSE_UNSUPPORTED", "XLSX worksheet relationship is invalid", 422);
    const path = normalizeWorksheetTarget(target);
    const entry = await readZipEntry(bytes, path);
    if (!entry) throw new AppError("ASSET_XLSX_PARSE_UNSUPPORTED", "XLSX worksheet is unavailable", 422);
    const xml = decodeXml(decodeUtf8(entry));
    rejectUnsafeXml(xml);
    const cells = parseCells(xml);
    if (cells.length === 0) continue;
    blocks.push(renderSheet(sheet.name, cells, sharedStrings));
  }
  if (blocks.length === 0) throw new AppError("ASSET_XLSX_EMPTY", "XLSX has no readable cells", 422);
  return { markdown: `${blocks.join("\n\n")}\n`, warnings: [] };
}

function parseSheets(xml: string): Array<{ name: string; relationshipId: string }> {
  const result: Array<{ name: string; relationshipId: string }> = [];
  for (const match of xml.matchAll(/<sheet\b([^>]*)\/?>(?:<\/sheet>)?/giu)) {
    const attrs = match[1] ?? "";
    const name = xmlAttribute(attrs, "name");
    const relationshipId = xmlAttribute(attrs, "id", "r:id");
    if (!name || !relationshipId) continue;
    result.push({ name: name.slice(0, 120), relationshipId });
  }
  return result;
}

function parseRelationships(xml: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/giu)) {
    const attrs = match[1] ?? "";
    const id = xmlAttribute(attrs, "Id");
    const target = xmlAttribute(attrs, "Target");
    if (id && target) result.set(id, target);
  }
  return result;
}

function parseSharedStrings(xml: string): string[] {
  rejectUnsafeXml(xml);
  const result: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/giu)) {
    result.push(extractText(match[1] ?? ""));
    if (result.length >= APP_CONFIG.maxXlsxCells) break;
  }
  return result;
}

function parseCells(xml: string): Cell[] {
  const result: Cell[] = [];
  for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/giu)) {
    if (result.length >= APP_CONFIG.maxXlsxCells) {
      throw new AppError("ASSET_XLSX_TOO_LARGE", "XLSX cell count exceeds the limit", 413);
    }
    const attrs = match[1] ?? "";
    const reference = xmlAttribute(attrs, "r");
    if (!reference) continue;
    const coordinate = parseCoordinate(reference);
    if (!coordinate) continue;
    const body = match[2] ?? "";
    const type = xmlAttribute(attrs, "t");
    const raw = type === "inlineStr"
      ? extractText(body)
      : type === "s"
        ? `\u0000s:${decodeXml(/<v\b[^>]*>([\s\S]*?)<\/v>/iu.exec(body)?.[1] ?? "")}`
        : decodeXml(/<v\b[^>]*>([\s\S]*?)<\/v>/iu.exec(body)?.[1] ?? "");
    result.push({ ...coordinate, value: raw });
  }
  return result;
}

function renderSheet(name: string, cells: Cell[], sharedStrings: string[]): string {
  const resolved = cells.map((cell, index) => {
    const source = cell.value;
    // The parser stores the cell type only implicitly, so shared-string
    // indices are resolved by observing the worksheet's `t="s"` in-place.
    return { ...cell, value: source };
  });
  // Reparse shared-string values from the cell XML is intentionally avoided in
  // the renderer; parseCells marks indexes with a private prefix.
  for (const cell of resolved) {
    if (cell.value.startsWith("\u0000s:")) {
      const index = Number(cell.value.slice(3));
      cell.value = Number.isSafeInteger(index) ? (sharedStrings[index] ?? "") : "";
    }
    cell.value = escapeCell(cell.value);
  }
  const minRow = Math.min(...resolved.map((cell) => cell.row));
  const maxRow = Math.max(...resolved.map((cell) => cell.row));
  const minColumn = Math.min(...resolved.map((cell) => cell.column));
  const maxColumn = Math.max(...resolved.map((cell) => cell.column));
  const values = new Map(resolved.map((cell) => [`${cell.row}:${cell.column}`, cell.value]));
  const headers = Array.from({ length: maxColumn - minColumn + 1 }, (_, offset) => columnName(minColumn + offset));
  const rows = Array.from({ length: maxRow - minRow + 1 }, (_, rowOffset) =>
    Array.from({ length: maxColumn - minColumn + 1 }, (_, columnOffset) => values.get(`${minRow + rowOffset}:${minColumn + columnOffset}`) ?? ""),
  );
  const usesFirstRowAsHeader = minRow === 1;
  const first = usesFirstRowAsHeader ? rows[0]!.map((value, index) => value || headers[index]!) : headers;
  const bodyRows = usesFirstRowAsHeader ? rows.slice(1) : rows;
  const range = `${columnName(minColumn)}${minRow}:${columnName(maxColumn)}${maxRow}`;
  return [
    `## Sheet: ${escapeHeading(name)} (${range})`,
    "",
    `| ${first.join(" | ")} |`,
    `| ${first.map(() => "---").join(" | ")} |`,
    ...bodyRows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function parseCoordinate(value: string): { row: number; column: number } | null {
  const match = /^([A-Z]{1,3})([1-9][0-9]*)$/iu.exec(value.trim());
  if (!match) return null;
  let column = 0;
  for (const character of match[1]!.toUpperCase()) column = column * 26 + character.charCodeAt(0) - 64;
  const row = Number(match[2]);
  return Number.isSafeInteger(row) && row <= APP_CONFIG.maxXlsxRows && column <= APP_CONFIG.maxXlsxColumns ? { row, column } : null;
}

function columnName(value: number): string {
  let result = "";
  for (let current = value; current > 0; current = Math.floor((current - 1) / 26)) result = String.fromCharCode(65 + ((current - 1) % 26)) + result;
  return result;
}

function extractText(value: string): string {
  return [...value.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/giu)].map((match) => decodeXml(match[1] ?? "")).join("").trim();
}

function decodeXml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|[0-9]+);/giu, (entity) => {
    const named: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
    if (named[entity]) return named[entity];
    const code = entity.startsWith("&#x") || entity.startsWith("&#X") ? Number.parseInt(entity.slice(3, -1), 16) : Number.parseInt(entity.slice(2, -1), 10);
    return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

function rejectUnsafeXml(xml: string): void {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(xml)) throw new AppError("ASSET_XLSX_PARSE_UNSUPPORTED", "XLSX XML contains unsupported declarations", 422);
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AppError("ASSET_CONTENT_INVALID", "Asset content encoding is invalid", 422);
  }
}

function xmlAttribute(attrs: string, ...names: string[]): string | null {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const match = new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*["']([^"']*)["']`, "iu").exec(attrs);
    if (match) return decodeXml(match[1] ?? "");
  }
  return null;
}

function normalizeWorksheetTarget(target: string): string {
  const value = target.replace(/^\/+/, "");
  if (value.startsWith("xl/")) return value;
  if (value.startsWith("worksheets/")) return `xl/${value}`;
  throw new AppError("ASSET_XLSX_PARSE_UNSUPPORTED", "XLSX worksheet path is invalid", 422);
}

async function readZipEntry(bytes: ArrayBuffer, wantedName: string): Promise<Uint8Array | null> {
  const view = new DataView(bytes);
  const endOffset = findEndOfCentralDirectory(view);
  if (endOffset < 0) throw new AppError("ASSET_XLSX_PARSE_UNSUPPORTED", "XLSX container is invalid", 422);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  const entries = view.getUint16(endOffset + 10, true);
  if (!isBoundedRange(centralOffset, centralSize, bytes.byteLength) || entries > APP_CONFIG.maxXlsxEntries) throw new AppError("ASSET_XLSX_PARSE_UNSUPPORTED", "XLSX directory is invalid", 422);
  let cursor = centralOffset;
  for (let index = 0; index < entries; index += 1) {
    if (!isBoundedRange(cursor, 46, bytes.byteLength) || view.getUint32(cursor, true) !== 0x02014b50) throw new AppError("ASSET_XLSX_PARSE_UNSUPPORTED", "XLSX directory is invalid", 422);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + 46;
    if (!isBoundedRange(nameStart, nameLength, bytes.byteLength)) throw new AppError("ASSET_XLSX_PARSE_UNSUPPORTED", "XLSX directory is invalid", 422);
    const name = new TextDecoder().decode(new Uint8Array(bytes, nameStart, nameLength));
    if (name === wantedName) {
      if (uncompressedSize > APP_CONFIG.maxXlsxXmlBytes || !isBoundedRange(localOffset, 30, bytes.byteLength)) throw new AppError("ASSET_XLSX_TOO_LARGE", "XLSX XML exceeds the limit", 413);
      const localNameLength = view.getUint16(localOffset + 26, true); const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      if (!isBoundedRange(dataOffset, compressedSize, bytes.byteLength)) throw new AppError("ASSET_XLSX_PARSE_UNSUPPORTED", "XLSX entry is invalid", 422);
      const compressed = new Uint8Array(bytes, dataOffset, compressedSize);
      if (method === 0) return compressed.slice();
      if (method !== 8) throw new AppError("ASSET_XLSX_PARSE_UNSUPPORTED", "XLSX compression is unsupported", 422);
      try {
        const stream = new DecompressionStream("deflate-raw"); const writer = stream.writable.getWriter();
        await writer.write(compressed); await writer.close();
        const result = new Uint8Array(await new Response(stream.readable).arrayBuffer());
        if (result.byteLength > APP_CONFIG.maxXlsxXmlBytes) throw new AppError("ASSET_XLSX_TOO_LARGE", "XLSX XML exceeds the limit", 413);
        return result;
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError("ASSET_XLSX_PARSE_UNSUPPORTED", "XLSX compression is invalid", 422);
      }
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

function findEndOfCentralDirectory(view: DataView): number {
  const start = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= start; offset -= 1) if (view.getUint32(offset, true) === 0x06054b50) return offset;
  return -1;
}

function isBoundedRange(offset: number, length: number, total: number): boolean {
  return Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 && length >= 0 && offset + length <= total;
}

function escapeCell(value: string): string { return value.replace(/\|/gu, "\\|").replace(/\r?\n/gu, " "); }
function escapeHeading(value: string): string { return value.replace(/[\r\n#]/gu, " ").trim(); }
