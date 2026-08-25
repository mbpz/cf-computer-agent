import { AppError } from "../http";
import { APP_CONFIG } from "../config";

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const allowedContentTypes = new Set([
  "text/plain", "text/markdown", "text/csv", "text/html", "application/json", "application/xml", "text/xml", "application/rtf",
  "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.spreadsheet",
  "image/png", "image/jpeg", "image/gif", "image/webp",
]);

export interface UrlSnapshot {
  finalUrl: string;
  originalName: string;
  contentType: string;
  bytes: ArrayBuffer;
}

export function validateSnapshotUrl(raw: unknown): URL {
  if (typeof raw !== "string" || raw.length > 2_048) throw new AppError("ASSET_URL_INVALID", "Snapshot URL is invalid", 400);
  let url: URL;
  try { url = new URL(raw); } catch { throw new AppError("ASSET_URL_INVALID", "Snapshot URL is invalid", 400); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new AppError("ASSET_URL_INVALID", "Snapshot URL is invalid", 400);
  }
  if (isBlockedHostname(url.hostname)) throw new AppError("ASSET_URL_SSRF_BLOCKED", "Snapshot URL is not allowed", 400);
  return url;
}

export async function fetchUrlSnapshot(
  raw: unknown,
  fetcher: typeof fetch = globalThis.fetch,
  options: { maxBytes?: number; maxRedirects?: number; timeoutMs?: number } = {},
): Promise<UrlSnapshot> {
  let url = validateSnapshotUrl(raw);
  const maxBytes = options.maxBytes ?? APP_CONFIG.maxAssetBytes;
  const maxRedirects = options.maxRedirects ?? 3;
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
    let response: Response;
    try {
      response = await fetcher(url, { method: "GET", redirect: "manual", signal: controller.signal });
    } catch {
      throw new AppError("ASSET_URL_FETCH_UNAVAILABLE", "Snapshot source is temporarily unavailable", 503, true);
    } finally { clearTimeout(timer); }
    if (redirectStatuses.has(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === maxRedirects) throw new AppError("ASSET_URL_REDIRECT_INVALID", "Snapshot redirects are not allowed", 400);
      url = validateSnapshotUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new AppError("ASSET_URL_FETCH_FAILED", "Snapshot source could not be fetched", 422);
    const contentType = (response.headers.get("content-type") || "application/octet-stream").split(";", 1)[0]!.trim().toLowerCase();
    if (!allowedContentTypes.has(contentType)) throw new AppError("ASSET_URL_TYPE_UNSUPPORTED", "Snapshot content type is not supported", 415);
    const declared = Number(response.headers.get("content-length"));
    if (Number.isSafeInteger(declared) && declared > maxBytes) throw new AppError("ASSET_TOO_LARGE", "Snapshot exceeds the upload limit", 413);
    const bytes = await readBody(response, maxBytes);
    if (bytes.byteLength === 0) throw new AppError("ASSET_EMPTY", "Snapshot is empty", 400);
    return { finalUrl: url.toString(), originalName: snapshotName(url, contentType), contentType, bytes };
  }
  throw new AppError("ASSET_URL_REDIRECT_INVALID", "Snapshot redirects are not allowed", 400);
}

async function readBody(response: Response, maxBytes: number): Promise<ArrayBuffer> {
  if (!response.body) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxBytes) throw new AppError("ASSET_TOO_LARGE", "Snapshot exceeds the upload limit", 413);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value;
      total += chunk.byteLength;
      if (total > maxBytes) throw new AppError("ASSET_TOO_LARGE", "Snapshot exceeds the upload limit", 413);
      chunks.push(chunk);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output.buffer;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "::" || host === "::1" || host === "0:0:0:0:0:0:0:1" || host === "169.254.169.254") return true;
  const octets = host.split(".").map(Number);
  if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || (a === 100 && b! >= 64 && b! <= 127)
      || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31)
      || (a === 192 && b === 168);
  }
  return false;
}

function snapshotName(url: URL, contentType: string): string {
  const candidate = decodeURIComponent(url.pathname.split("/").at(-1) || "").replace(/[^A-Za-z0-9._-]/gu, "_").slice(0, 128);
  if (candidate && candidate !== "." && candidate !== "..") return candidate;
  const extension = contentType === "text/html" ? "html" : contentType.split("/", 2)[1] || "bin";
  return `snapshot.${extension.replace(/[^A-Za-z0-9]/gu, "") || "bin"}`;
}
