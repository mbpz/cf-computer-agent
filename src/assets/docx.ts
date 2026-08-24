import { APP_CONFIG } from "../config";
import { AppError } from "../http";

export interface RecoveredDocxMarkdown {
  markdown: string;
  warnings: string[];
}

/** Bounded OOXML reader for word/document.xml; external entities are never evaluated. */
export async function recoverDocxMarkdown(bytes: ArrayBuffer): Promise<RecoveredDocxMarkdown> {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) {
    throw new AppError("ASSET_CONTENT_INVALID", "Asset content is invalid", 422);
  }
  if (bytes.byteLength > APP_CONFIG.maxDocxParseBytes) {
    throw new AppError("ASSET_DOCX_TOO_LARGE", "DOCX parsing input exceeds the limit", 413);
  }
  const xml = await readZipEntry(bytes, "word/document.xml");
  if (!xml) throw new AppError("ASSET_DOCX_PARSE_UNSUPPORTED", "DOCX document part is unavailable", 422);

  let document: string;
  try {
    document = new TextDecoder("utf-8", { fatal: true }).decode(xml);
  } catch {
    throw new AppError("ASSET_CONTENT_INVALID", "Asset content encoding is invalid", 422);
  }
  const blocks = parseDocumentBlocks(document);
  if (blocks.length === 0) throw new AppError("ASSET_DOCX_EMPTY", "DOCX has no readable body", 422);
  return { markdown: `${blocks.join("\n\n")}\n`, warnings: [] };
}

async function readZipEntry(bytes: ArrayBuffer, wantedName: string): Promise<Uint8Array | null> {
  const view = new DataView(bytes);
  const endOffset = findEndOfCentralDirectory(view);
  if (endOffset < 0) throw new AppError("ASSET_DOCX_PARSE_UNSUPPORTED", "DOCX container is invalid", 422);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  const entries = view.getUint16(endOffset + 10, true);
  if (!isBoundedRange(centralOffset, centralSize, bytes.byteLength)) {
    throw new AppError("ASSET_DOCX_PARSE_UNSUPPORTED", "DOCX container is invalid", 422);
  }

  let cursor = centralOffset;
  for (let index = 0; index < entries; index += 1) {
    if (!isBoundedRange(cursor, 46, bytes.byteLength) || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new AppError("ASSET_DOCX_PARSE_UNSUPPORTED", "DOCX directory is invalid", 422);
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + 46;
    if (!isBoundedRange(nameStart, nameLength, bytes.byteLength)) {
      throw new AppError("ASSET_DOCX_PARSE_UNSUPPORTED", "DOCX directory is invalid", 422);
    }
    const name = new TextDecoder().decode(new Uint8Array(bytes, nameStart, nameLength));
    if (name === wantedName) {
      if (uncompressedSize > APP_CONFIG.maxDocxXmlBytes || !isBoundedRange(localOffset, 30, bytes.byteLength)) {
        throw new AppError("ASSET_DOCX_TOO_LARGE", "DOCX XML exceeds the limit", 413);
      }
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      if (!isBoundedRange(dataOffset, compressedSize, bytes.byteLength)) {
        throw new AppError("ASSET_DOCX_PARSE_UNSUPPORTED", "DOCX entry is invalid", 422);
      }
      const compressed = new Uint8Array(bytes, dataOffset, compressedSize);
      if (method === 0) return compressed.slice();
      if (method !== 8) throw new AppError("ASSET_DOCX_PARSE_UNSUPPORTED", "DOCX compression is unsupported", 422);
      try {
        const stream = new DecompressionStream("deflate-raw");
        const writer = stream.writable.getWriter();
        await writer.write(compressed);
        await writer.close();
        const result = new Uint8Array(await new Response(stream.readable).arrayBuffer());
        if (result.byteLength > APP_CONFIG.maxDocxXmlBytes) {
          throw new AppError("ASSET_DOCX_TOO_LARGE", "DOCX XML exceeds the limit", 413);
        }
        return result;
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError("ASSET_DOCX_PARSE_UNSUPPORTED", "DOCX compression is invalid", 422);
      }
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

function findEndOfCentralDirectory(view: DataView): number {
  const start = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

function parseDocumentBlocks(document: string): string[] {
  const blocks: string[] = [];
  const pattern = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/gu;
  for (const match of document.matchAll(pattern)) {
    const block = match[0] ?? "";
    if (block.startsWith("<w:tbl")) {
      const table = parseTable(block);
      if (table) blocks.push(table);
    } else {
      const paragraph = parseParagraph(block);
      if (paragraph) blocks.push(paragraph);
    }
  }
  return blocks;
}

function parseParagraph(block: string): string {
  const text = extractText(block);
  if (!text) return "";
  const style = /<w:pStyle\b[^>]*w:val=["']Heading(\d+)["']/u.exec(block)?.[1];
  if (!style) return text;
  return `${"#".repeat(Math.min(6, Math.max(1, Number(style))))} ${text}`;
}

function parseTable(block: string): string {
  const rows: string[][] = [];
  for (const rowMatch of block.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/gu)) {
    const row: string[] = [];
    for (const cellMatch of (rowMatch[0] ?? "").matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/gu)) {
      row.push(extractText(cellMatch[0] ?? "").replace(/\|/gu, "\\|"));
    }
    if (row.length > 0) rows.push(row);
  }
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const padded = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")]);
  return [
    `| ${padded[0]!.join(" | ")} |`,
    `| ${padded[0]!.map(() => "---").join(" | ")} |`,
    ...padded.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function extractText(block: string): string {
  const parts: string[] = [];
  for (const match of block.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)) {
    parts.push(decodeXml(match[1] ?? ""));
  }
  if (block.includes("<w:tab")) parts.push("\t");
  return parts.join("").replace(/[ \t]+/gu, " ").trim();
}

function decodeXml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|[0-9]+);/giu, (entity) => {
    const named: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&apos;": "'" };
    if (named[entity]) return named[entity];
    const code = entity.startsWith("&#x") || entity.startsWith("&#X")
      ? Number.parseInt(entity.slice(3, -1), 16)
      : Number.parseInt(entity.slice(2, -1), 10);
    return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

function isBoundedRange(offset: number, length: number, total: number): boolean {
  return Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 && length >= 0 && offset + length <= total;
}
