import { AppError } from "../http";

/** Single asset boundary for all parser outputs before any parsed object is written. */
export function assertReadableParsedMarkdown(markdown: unknown): asserts markdown is string {
  if (typeof markdown !== "string" || markdown.trim().length === 0) {
    throw new AppError("SOURCE_EMPTY", "Source content is empty", 400);
  }
}
