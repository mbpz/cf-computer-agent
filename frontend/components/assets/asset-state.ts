export type AssetStatus = "queued" | "processing" | "ready" | "failed_retryable" | "failed_terminal";

export function assetStatusModel(asset: { status?: string; lastErrorCode?: string }) {
  switch (asset.status) {
    case "queued": return { tone: "info" as const, label: "Queued", retryable: true };
    case "processing": return { tone: "info" as const, label: "Processing", retryable: true };
    case "ready": return { tone: "success" as const, label: "Ready", retryable: false };
    case "failed_retryable": return { tone: "warning" as const, label: "Retry needed", retryable: true, errorCode: asset.lastErrorCode };
    case "failed_terminal": return { tone: "destructive" as const, label: "Failed", retryable: false, errorCode: asset.lastErrorCode };
    default: return { tone: "muted" as const, label: "Status unavailable", retryable: false };
  }
}
