import type { SubmissionKind } from "../submissions/types";

export const MAX_REVISION_CHUNKS = 256;

export function hasSemanticSourceContent(kind: SubmissionKind, normalizedMarkdown: string): boolean {
  if (normalizedMarkdown.trim().length === 0) return false;
  if (kind !== "code") return true;

  const lines = normalizedMarkdown.endsWith("\n")
    ? normalizedMarkdown.slice(0, -1).split("\n")
    : normalizedMarkdown.split("\n");
  if (lines.length < 3) return false;
  const opening = /^(`{3,})[^`]*$/u.exec(lines[0]!);
  if (opening === null || lines.at(-1) !== opening[1]) return false;
  return lines.slice(1, -1).some((line) => line.trim().length > 0);
}
