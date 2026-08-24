import { APP_CONFIG } from "../config";
import { AppError } from "../http";

export interface RecoveredPptxMarkdown { markdown: string; warnings: string[] }
type Entry = { bytes: Uint8Array; size: number };

export async function recoverPptxMarkdown(bytes: ArrayBuffer): Promise<RecoveredPptxMarkdown> {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) throw new AppError("ASSET_PPTX_EMPTY", "PPTX is empty", 422);
  if (bytes.byteLength > APP_CONFIG.maxPptxParseBytes) throw new AppError("ASSET_PPTX_TOO_LARGE", "PPTX parsing input exceeds the limit", 413);
  const presentation = await readZipEntry(bytes, "ppt/presentation.xml"); const rels = await readZipEntry(bytes, "ppt/_rels/presentation.xml.rels");
  if (!presentation || !rels) throw new AppError("ASSET_PPTX_PARSE_UNSUPPORTED", "PPTX presentation metadata is unavailable", 422);
  const presentationXml = decode(presentation.bytes); const relsXml = decode(rels.bytes); rejectUnsafe(presentationXml); rejectUnsafe(relsXml);
  const relationships = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/giu)) { const id = attr(match[1] ?? "", "Id"); const target = attr(match[1] ?? "", "Target"); if (id && target) relationships.set(id, target); }
  const slideIds = [...presentationXml.matchAll(/<p:sldId\b([^>]*)\/?>(?:<\/p:sldId>)?/giu)].map((match) => attr(match[1] ?? "", "id") ? attr(match[1] ?? "", "r:id") : null).filter((id): id is string => Boolean(id));
  if (!slideIds.length) throw new AppError("ASSET_PPTX_EMPTY", "PPTX has no slides", 422);
  const blocks: string[] = [];
  for (let index = 0; index < Math.min(slideIds.length, APP_CONFIG.maxPptxSlides); index += 1) {
    const target = relationships.get(slideIds[index]!); if (!target) throw new AppError("ASSET_PPTX_PARSE_UNSUPPORTED", "PPTX slide relationship is invalid", 422);
    const path = normalizeTarget(target); const slide = await readZipEntry(bytes, path); if (!slide) throw new AppError("ASSET_PPTX_PARSE_UNSUPPORTED", "PPTX slide is unavailable", 422);
    const xml = decode(slide.bytes); rejectUnsafe(xml); const elements = [...xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/giu)].map((match) => [...(match[1] ?? "").matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/giu)].map((part) => decodeEntities(stripTags(part[1] ?? ""))).join("").trim()).filter(Boolean);
    if (elements.length) blocks.push([`## Slide ${index + 1}`, ...elements].join("\n\n"));
  }
  if (!blocks.length) throw new AppError("ASSET_PPTX_EMPTY", "PPTX has no readable text", 422);
  const markdown = `${blocks.join("\n\n")}\n`; if (new TextEncoder().encode(markdown).byteLength > APP_CONFIG.maxPptxOutputBytes) throw new AppError("ASSET_PPTX_OUTPUT_TOO_LARGE", "PPTX output exceeds the limit", 422);
  return { markdown, warnings: [] };
}

function normalizeTarget(target: string): string { const value = target.replace(/^\/+/, ""); if (value.startsWith("ppt/")) return value; if (value.startsWith("slides/")) return `ppt/${value}`; throw new AppError("ASSET_PPTX_PARSE_UNSUPPORTED", "PPTX slide path is invalid", 422); }
function rejectUnsafe(xml: string): void { if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(xml)) throw new AppError("ASSET_PPTX_PARSE_UNSUPPORTED", "PPTX XML declarations are unsupported", 422); }
function decode(bytes: Uint8Array): string { try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new AppError("ASSET_CONTENT_INVALID", "Asset content encoding is invalid", 422); } }
function attr(attrs: string, name: string): string | null { const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); return new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*["']([^"']*)["']`, "iu").exec(attrs)?.[1] ?? null; }
function stripTags(value: string): string { return value.replace(/<[^>]+>/gu, ""); }
function decodeEntities(value: string): string { return value.replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|[0-9]+);/giu, (entity) => { const named: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" }; if (named[entity]) return named[entity]; const code = entity.startsWith("&#x") || entity.startsWith("&#X") ? Number.parseInt(entity.slice(3, -1), 16) : Number.parseInt(entity.slice(2, -1), 10); return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""; }); }

async function readZipEntry(bytes: ArrayBuffer, wanted: string): Promise<Entry | null> { const view = new DataView(bytes); const end = findEnd(view); if (end < 0) throw new AppError("ASSET_PPTX_PARSE_UNSUPPORTED", "PPTX container is invalid", 422); const centralSize = view.getUint32(end + 12, true); const centralOffset = view.getUint32(end + 16, true); const count = view.getUint16(end + 10, true); if (!bounded(centralOffset, centralSize, bytes.byteLength) || count > APP_CONFIG.maxPptxEntries) throw new AppError("ASSET_PPTX_PARSE_UNSUPPORTED", "PPTX directory is invalid", 422); let cursor = centralOffset; for (let index = 0; index < count; index += 1) { if (!bounded(cursor, 46, bytes.byteLength) || view.getUint32(cursor, true) !== 0x02014b50) throw new AppError("ASSET_PPTX_PARSE_UNSUPPORTED", "PPTX directory is invalid", 422); const method = view.getUint16(cursor + 10, true); const compressed = view.getUint32(cursor + 20, true); const size = view.getUint32(cursor + 24, true); const nameLength = view.getUint16(cursor + 28, true); const extra = view.getUint16(cursor + 30, true); const comment = view.getUint16(cursor + 32, true); const local = view.getUint32(cursor + 42, true); const nameStart = cursor + 46; if (!bounded(nameStart, nameLength, bytes.byteLength)) throw new AppError("ASSET_PPTX_PARSE_UNSUPPORTED", "PPTX directory is invalid", 422); const name = new TextDecoder().decode(new Uint8Array(bytes, nameStart, nameLength)); if (name === wanted) { if (size > APP_CONFIG.maxPptxXmlBytes || !bounded(local, 30, bytes.byteLength)) throw new AppError("ASSET_PPTX_TOO_LARGE", "PPTX XML exceeds the limit", 413); const localName = view.getUint16(local + 26, true); const localExtra = view.getUint16(local + 28, true); const dataOffset = local + 30 + localName + localExtra; if (!bounded(dataOffset, compressed, bytes.byteLength)) throw new AppError("ASSET_PPTX_PARSE_UNSUPPORTED", "PPTX entry is invalid", 422); const data = new Uint8Array(bytes, dataOffset, compressed); if (method === 0) return { bytes: data.slice(), size }; if (method !== 8) throw new AppError("ASSET_PPTX_PARSE_UNSUPPORTED", "PPTX compression is unsupported", 422); try { const stream = new DecompressionStream("deflate-raw"); const writer = stream.writable.getWriter(); await writer.write(data); await writer.close(); const result = new Uint8Array(await new Response(stream.readable).arrayBuffer()); if (result.byteLength > APP_CONFIG.maxPptxXmlBytes) throw new AppError("ASSET_PPTX_TOO_LARGE", "PPTX XML exceeds the limit", 413); return { bytes: result, size: result.byteLength }; } catch (error) { if (error instanceof AppError) throw error; throw new AppError("ASSET_PPTX_PARSE_UNSUPPORTED", "PPTX compression is invalid", 422); } } cursor += 46 + nameLength + extra + comment; } return null; }
function findEnd(view: DataView): number { for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 65_557); offset -= 1) if (view.getUint32(offset, true) === 0x06054b50) return offset; return -1; }
function bounded(offset: number, length: number, total: number): boolean { return Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 && length >= 0 && offset + length <= total; }
