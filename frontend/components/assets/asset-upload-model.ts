export type AssetUploadModel =
  | { kind: "disabled"; reason: "OBJECT_STORAGE_UNAVAILABLE" }
  | { kind: "idle" }
  | { kind: "invalid"; reason: "NAME_REQUIRED" | "TOO_LARGE" };

export function assetUploadModel(input: { enabled: boolean; file?: { name?: string; size?: number }; maxBytes: number }): AssetUploadModel {
  if (!input.enabled) return { kind: "disabled", reason: "OBJECT_STORAGE_UNAVAILABLE" };
  if (!input.file) return { kind: "idle" };
  if (typeof input.file.name !== "string" || !input.file.name.trim()) return { kind: "invalid", reason: "NAME_REQUIRED" };
  if (!Number.isSafeInteger(input.file.size) || input.file.size < 0 || input.file.size > input.maxBytes) return { kind: "invalid", reason: "TOO_LARGE" };
  return { kind: "idle" };
}
