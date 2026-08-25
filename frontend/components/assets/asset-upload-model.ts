export type AssetUploadModel =
  | { kind: "disabled"; reason: "OBJECT_STORAGE_UNAVAILABLE" }
  | { kind: "idle" }
  | { kind: "invalid"; reason: "NAME_REQUIRED" | "TOO_LARGE" | "TYPE_UNSUPPORTED" | "COUNT_EXCEEDED" };

export const ASSET_PICKER_ACCEPT = [
  ".pdf", ".docx", ".pptx", ".xlsx", ".csv", ".txt", ".md", ".html", ".xml", ".odt", ".ods",
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
].join(",");

const acceptedExtensions = new Set(ASSET_PICKER_ACCEPT.split(","));

export function clipboardImageFiles(
  items: readonly { kind?: string; type?: string; getAsFile?: () => File | null }[],
): File[] {
  return items.flatMap((item, index) => {
    if (item.kind !== "file" || typeof item.type !== "string" || !/^image\/(?:png|jpeg|gif|webp)$/iu.test(item.type) || !item.getAsFile) return [];
    const file = item.getAsFile();
    if (!file) return [];
    const extension = item.type.slice("image/".length).replace("jpeg", "jpg");
    return [file.name ? file : new File([file], `clipboard-${index + 1}.${extension}`, { type: item.type })];
  });
}

/** Keeps a relative folder path as display-only metadata; never use this as an object key. */
export function displayRelativePath(file: { name?: string; webkitRelativePath?: string }): string {
  const raw = typeof file.webkitRelativePath === "string" && file.webkitRelativePath.trim()
    ? file.webkitRelativePath : (file.name || "file");
  const segments = raw.replaceAll("\\", "/").split("/").filter((segment) => segment && segment !== "." && segment !== "..");
  return segments.map((segment) => segment.replace(/[\u0000-\u001f\u007f-\u009f]/gu, "_")).join("/").slice(0, 512) || "file";
}

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
