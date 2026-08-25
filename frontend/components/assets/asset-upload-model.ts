export type AssetUploadModel =
  | { kind: "disabled"; reason: "OBJECT_STORAGE_UNAVAILABLE" }
  | { kind: "idle" }
  | { kind: "invalid"; reason: "NAME_REQUIRED" | "TOO_LARGE" | "TYPE_UNSUPPORTED" | "COUNT_EXCEEDED" };

export const ASSET_PICKER_ACCEPT = [
  ".pdf", ".docx", ".pptx", ".xlsx", ".csv", ".txt", ".md", ".html", ".xml", ".odt", ".ods",
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
].join(",");

const acceptedExtensions = new Set(ASSET_PICKER_ACCEPT.split(","));

export function assetUploadModel(input: {
  enabled: boolean;
  file?: { name?: string; size?: number; type?: string };
  files?: readonly { name?: string; size?: number; type?: string }[];
  maxBytes: number;
  maxFiles?: number;
}): AssetUploadModel {
  if (!input.enabled) return { kind: "disabled", reason: "OBJECT_STORAGE_UNAVAILABLE" };
  const files = input.files ?? (input.file ? [input.file] : []);
  if (!files.length) return { kind: "idle" };
  if (files.length > (input.maxFiles ?? 1)) return { kind: "invalid", reason: "COUNT_EXCEEDED" };
  for (const file of files) {
    if (typeof file.name !== "string" || !file.name.trim()) return { kind: "invalid", reason: "NAME_REQUIRED" };
    const extension = `.${file.name.split(".").at(-1)?.toLowerCase() || ""}`;
    if (!acceptedExtensions.has(extension)) return { kind: "invalid", reason: "TYPE_UNSUPPORTED" };
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > input.maxBytes) return { kind: "invalid", reason: "TOO_LARGE" };
  }
  return { kind: "idle" };
}
