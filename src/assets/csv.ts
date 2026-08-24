import { APP_CONFIG } from "../config";
import { AppError } from "../http";

export interface RecoveredCsvMarkdown { markdown: string; warnings: string[] }

/** RFC 4180-style, UTF-8 CSV recovery with bounded rows, columns and fields. */
export function recoverCsvMarkdown(bytes: ArrayBuffer): RecoveredCsvMarkdown {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) throw new AppError("ASSET_CSV_EMPTY", "CSV is empty", 422);
  if (bytes.byteLength > APP_CONFIG.maxCsvParseBytes) throw new AppError("ASSET_CSV_TOO_LARGE", "CSV parsing input exceeds the limit", 413);
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/u, ""); }
  catch { throw new AppError("ASSET_CONTENT_INVALID", "Asset content encoding is invalid", 422); }
  if (text.trim().length === 0) throw new AppError("ASSET_CSV_EMPTY", "CSV is empty", 422);
  const delimiter = detectDelimiter(text);
  const rows = parseRows(text, delimiter);
  while (rows.length > 0 && rows[rows.length - 1]!.every((cell) => cell === "")) rows.pop();
  if (rows.length === 0 || rows[0]!.every((cell) => cell.trim() === "")) throw new AppError("ASSET_CSV_EMPTY", "CSV has no readable rows", 422);
  const width = Math.max(...rows.map((row) => row.length));
  if (width === 0) throw new AppError("ASSET_CSV_EMPTY", "CSV has no readable cells", 422);
  const padded = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")]);
  const headers = padded[0]!.map((cell, index) => cell || columnName(index + 1));
  const range = `A1:${columnName(width)}${padded.length}`;
  return {
    markdown: [
      `## CSV (${range})`, "", `| ${headers.map(escapeCell).join(" | ")} |`,
      `| ${headers.map(() => "---").join(" | ")} |`,
      ...padded.slice(1).map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
      "",
    ].join("\n"),
    warnings: [],
  };
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/u).find((line) => line.trim().length > 0) ?? "";
  const candidates = [",", ";", "\t", "|"];
  let best = ","; let bestCount = -1;
  for (const candidate of candidates) {
    const count = countOutsideQuotes(sample, candidate);
    if (count > bestCount) { best = candidate; bestCount = count; }
  }
  return best;
}

function countOutsideQuotes(value: string, delimiter: string): number {
  let quoted = false; let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"') { if (quoted && value[index + 1] === '"') index += 1; else quoted = !quoted; }
    else if (!quoted && value[index] === delimiter) count += 1;
  }
  return count;
}

function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; }
        else quoted = false;
      } else { field += character; }
    } else if (character === '"' && field.length === 0) quoted = true;
    else if (character === delimiter) { row.push(boundField(field)); field = ""; }
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(boundField(field)); field = "";
      if (rows.length >= APP_CONFIG.maxCsvRows) throw new AppError("ASSET_CSV_TOO_LARGE", "CSV row count exceeds the limit", 413);
      rows.push(row); row = [];
    } else field += character;
    if (field.length > APP_CONFIG.maxCsvFieldChars) throw new AppError("ASSET_CSV_TOO_LARGE", "CSV field exceeds the limit", 413);
    if (row.length > APP_CONFIG.maxCsvColumns) throw new AppError("ASSET_CSV_TOO_LARGE", "CSV column count exceeds the limit", 413);
  }
  if (quoted) throw new AppError("ASSET_CSV_PARSE_UNSUPPORTED", "CSV quoting is invalid", 422);
  if (field.length > 0 || row.length > 0 || text.endsWith(delimiter)) row.push(boundField(field));
  if (row.length > 0) rows.push(row);
  return rows;
}

function boundField(value: string): string { return value.replace(/[\r\n]+/gu, " ").trim(); }
function escapeCell(value: string): string { return value.replace(/\|/gu, "\\|").replace(/[\r\n]+/gu, " "); }
function columnName(value: number): string { let result = ""; for (let current = value; current > 0; current = Math.floor((current - 1) / 26)) result = String.fromCharCode(65 + ((current - 1) % 26)) + result; return result; }
