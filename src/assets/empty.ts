import { AppError } from "../http";
import { APP_CONFIG } from "../config";

/** Single asset boundary for all parser outputs before any parsed object is written. */
export function assertReadableParsedMarkdown(markdown: unknown): asserts markdown is string {
  if (typeof markdown !== "string" || markdown.trim().length === 0) {
    throw new AppError("SOURCE_EMPTY", "Source content is empty", 400);
  }
}

/** Defense-in-depth byte boundary for adapters added after the source parser. */
export function assertParsedMarkdownSize(markdown: string): void {
  if (new TextEncoder().encode(markdown).byteLength > APP_CONFIG.maxParsedAssetOutputBytes) {
    throw new AppError("SOURCE_TOO_LARGE", "Source content exceeds the limit", 400);
  }
}
