export interface DiffDocument {
  id: string;
  title: string;
  tags: string[];
  visibility: string;
  parserSchemaVersion: string | null;
  codeMetadata: unknown;
  markdown: string;
}

export type RevisionDiffLineKind = "context" | "added" | "removed";

export interface RevisionDiffLine {
  kind: RevisionDiffLineKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface RevisionDiffHunk {
  oldStart: number;
  newStart: number;
  lines: RevisionDiffLine[];
}

export interface RevisionDiffMetadataChange {
  field: "title" | "tags" | "visibility" | "parserSchemaVersion" | "codeMetadata";
  from: unknown;
  to: unknown;
}

export interface RevisionDiffResult {
  fromRevisionId: string;
  toRevisionId: string;
  changed: boolean;
  metadataChanges: RevisionDiffMetadataChange[];
  stats: { added: number; removed: number; unchanged: number; truncated: boolean };
  hunks: RevisionDiffHunk[];
}

const MAX_OUTPUT_LINES = 240;
const MAX_LCS_WORK = 1_000_000;

type Operation = RevisionDiffLine & { kind: RevisionDiffLineKind };

export function buildRevisionDiff(from: DiffDocument, to: DiffDocument): RevisionDiffResult {
  const oldLines = splitLines(from.markdown);
  const newLines = splitLines(to.markdown);
  const metadataChanges = metadataDiff(from, to);
  const operations = oldLines.length * newLines.length <= MAX_LCS_WORK
    ? lcsOperations(oldLines, newLines)
    : coarseOperations(oldLines, newLines);
  const added = operations.filter((line) => line.kind === "added").length;
  const removed = operations.filter((line) => line.kind === "removed").length;
  const unchanged = operations.length - added - removed;
  const visible = operations.slice(0, MAX_OUTPUT_LINES);
  return {
    fromRevisionId: from.id,
    toRevisionId: to.id,
    changed: added > 0 || removed > 0 || metadataChanges.length > 0,
    metadataChanges,
    stats: {
      added,
      removed,
      unchanged,
      truncated: visible.length < operations.length,
    },
    hunks: [{ oldStart: 1, newStart: 1, lines: visible }],
  };
}

function splitLines(markdown: string): string[] {
  return markdown.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
}

function lcsOperations(oldLines: string[], newLines: string[]): Operation[] {
  const width = newLines.length + 1;
  const table = new Uint32Array((oldLines.length + 1) * width);
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      const offset = oldIndex * width + newIndex;
      table[offset] = oldLines[oldIndex] === newLines[newIndex]
        ? table[(oldIndex + 1) * width + newIndex + 1]! + 1
        : Math.max(table[(oldIndex + 1) * width + newIndex]!, table[oldIndex * width + newIndex + 1]!);
    }
  }
  const operations: Operation[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
      operations.push({ kind: "context", text: oldLines[oldIndex]!, oldLine: oldIndex + 1, newLine: newIndex + 1 });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }
    const down = oldIndex < oldLines.length ? table[(oldIndex + 1) * width + newIndex]! : 0;
    const right = newIndex < newLines.length ? table[oldIndex * width + newIndex + 1]! : 0;
    if (newIndex < newLines.length && (oldIndex === oldLines.length || right >= down)) {
      operations.push({ kind: "added", text: newLines[newIndex]!, oldLine: null, newLine: newIndex + 1 });
      newIndex += 1;
    } else {
      operations.push({ kind: "removed", text: oldLines[oldIndex]!, oldLine: oldIndex + 1, newLine: null });
      oldIndex += 1;
    }
  }
  return operations;
}

function coarseOperations(oldLines: string[], newLines: string[]): Operation[] {
  return [
    ...oldLines.map((text, index) => ({ kind: "removed" as const, text, oldLine: index + 1, newLine: null })),
    ...newLines.map((text, index) => ({ kind: "added" as const, text, oldLine: null, newLine: index + 1 })),
  ];
}

function metadataDiff(from: DiffDocument, to: DiffDocument): RevisionDiffMetadataChange[] {
  const fields: Array<RevisionDiffMetadataChange["field"]> = [
    "title", "tags", "visibility", "parserSchemaVersion", "codeMetadata",
  ];
  return fields.flatMap((field) => {
    const oldValue = from[field];
    const newValue = to[field];
    return JSON.stringify(oldValue) === JSON.stringify(newValue)
      ? []
      : [{ field, from: oldValue, to: newValue }];
  });
}
