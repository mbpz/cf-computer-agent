export interface AssetPreviewModel {
  readonly assetId: string;
  readonly originalName: string;
  readonly markdown: string;
  readonly warnings: readonly string[];
  readonly lineCount: number;
  readonly parserSchemaVersion: string;
}

export function assetPreviewModel(input: unknown): AssetPreviewModel | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const assetId = typeof value.assetId === "string" ? value.assetId.trim() : "";
  const originalName = typeof value.originalName === "string" ? value.originalName.trim() : "";
  if (!assetId || !originalName) return null;
  const markdown = typeof value.markdown === "string" ? value.markdown : "";
  const warnings = Array.isArray(value.warnings) ? value.warnings.filter((warning): warning is string => typeof warning === "string" && warning.trim().length > 0).map((warning) => warning.trim()).slice(0, 20) : [];
  const lineCount = typeof value.lineCount === "number" && Number.isSafeInteger(value.lineCount) && value.lineCount >= 0 ? value.lineCount : markdown ? markdown.split("\n").length : 0;
  const parserSchemaVersion = typeof value.parserSchemaVersion === "string" && value.parserSchemaVersion.trim() ? value.parserSchemaVersion.trim() : "unknown";
  return Object.freeze({ assetId, originalName, markdown, warnings, lineCount, parserSchemaVersion });
}
