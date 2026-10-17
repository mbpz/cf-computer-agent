import { useEffect, useRef, useState } from "react";
import { FileUpload, type FileUploadItem, type FileUploadStatus } from "../motion/file-upload";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { ASSET_PICKER_ACCEPT, assetUploadModel, clipboardImageFiles, displayRelativePath, type AssetUploadModel } from "./asset-upload-model";
import { createAssetUploadQueue, type AssetQueueItem, type AssetQueueStatus } from "./asset-upload-queue";

/** The queue's own states, and the dropzone payload's four row states. */
const payloadStatus: Record<AssetQueueStatus, FileUploadStatus> = {
  queued: "queued",
  processing: "uploading",
  succeeded: "success",
  failed: "error",
};

/**
 * The submission's one attachment surface, on beUI's `file-upload`: the payload owns the
 * picker, the drop target, the drag state and the label set, and this adapter owns what
 * the product already had — single-file selection, the validation model, the paste path,
 * the resumable upload queue and its `data-upload-status` rows.
 *
 * §17 patches used (see `components/motion/file-upload.tsx`): labels, root attribute
 * passthrough, `renderRow` for the localized queue row, and `onFilesRejected` so a
 * two-file drop is still refused as "one file at a time" instead of being silently
 * trimmed to one.
 */
export function AssetDropzone({ locale, disabledMessage, enabled = false, maxBytes = 10 * 1024 * 1024, showQueue = true, onFile, onFiles }: { locale?: LocaleRuntime; disabledMessage?: string; enabled?: boolean; maxBytes?: number; showQueue?: boolean; onFile?: (file: File) => void; onFiles?: (files: File[]) => Promise<void> }) {
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<AssetQueueItem<File>[]>([]);
  const [validation, setValidation] = useState<AssetUploadModel>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const rejected = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const model = assetUploadModel({ enabled: enabled && Boolean(onFiles || onFile), maxBytes });
  const disabled = model.kind === "disabled";
  const acceptFiles = (files: File[]) => {
    if (disabled || inFlight.current || files.length === 0) return;
    const next = assetUploadModel({ enabled, maxBytes, files });
    setValidation(next);
    if (next.kind !== "idle") return;
    inFlight.current = true;
    setBusy(true);
    const uploadQueue = createAssetUploadQueue(files, async (file) => onFiles ? onFiles([file]) : onFile?.(file), {
      onChange: (items) => { if (mounted.current) setQueue(items); },
    });
    setQueue(uploadQueue.items);
    void uploadQueue.run().finally(() => {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    });
  };
  const validationKey = validation.kind !== "invalid" ? null
    : validation.reason === "TOO_LARGE" ? "SUBMIT_ASSET_TOO_LARGE"
    : validation.reason === "COUNT_EXCEEDED" ? "SUBMIT_ASSET_TOO_MANY"
    : validation.reason === "EMPTY" ? "ASSET_FLOW_EMPTY"
    : validation.reason === "TYPE_UNSUPPORTED" ? "SUBMIT_ASSET_UNSUPPORTED" : "SUBMIT_ASSET_INVALID";
  const statusKeys = { queued: "SUBMIT_ASSET_QUEUED", processing: "SUBMIT_ASSET_PROCESSING", succeeded: "SUBMIT_ASSET_SUCCEEDED", failed: "SUBMIT_ASSET_FAILED" } as const;
  const items: FileUploadItem[] = showQueue
    ? queue.map((item) => ({ id: item.id, name: displayRelativePath(item.value), size: item.value.size, type: item.value.type, status: payloadStatus[item.status] }))
    : [];
  const queueById = new Map(queue.map((item) => [item.id, item]));
  return <div
    data-drop-target="asset"
    data-asset-drop=""
    aria-disabled={disabled ? "true" : undefined}
    aria-busy={busy}
    className={`rounded-lg border border-dashed bg-muted/20 p-5 ${dragging ? "ring-2 ring-primary" : ""}`}
    onPaste={(event) => {
      if (disabled || busy) return;
      const files = clipboardImageFiles(Array.from(event.clipboardData.items));
      if (files.length) { event.preventDefault(); acceptFiles(files); }
    }}
    onDragEnter={(event) => { event.preventDefault(); if (!disabled && !busy) setDragging(true); }}
    onDragOver={(event) => { event.preventDefault(); }}
    onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
    onDrop={(event) => {
      // The payload's own drop surface already consumed this drop; only a drop on the
      // outer frame reaches here unhandled.
      if (event.defaultPrevented) return;
      event.preventDefault();
      setDragging(false);
      acceptFiles(Array.from(event.dataTransfer.files));
    }}
  >
    <FileUpload
      multiple={false}
      accept={ASSET_PICKER_ACCEPT}
      disabled={disabled || busy}
      value={items}
      labels={{
        input: frontendText(locale, "SUBMIT_ASSET_SELECT"),
        uploadLimit: frontendText(locale, "SUBMIT_ASSET_TOO_MANY"),
        filesAdded: `${frontendText(locale, "SUBMIT_ASSET_QUEUE")}: {count}/{max}`,
        retry: frontendText(locale, "COMMON_RETRY"),
        remove: frontendText(locale, "COMMON_DISMISS"),
        progress: `${frontendText(locale, "SUBMIT_ASSET_QUEUE")}: {name}`,
        status: { queued: frontendText(locale, "SUBMIT_ASSET_QUEUED"), uploading: frontendText(locale, "SUBMIT_ASSET_PROCESSING"), success: frontendText(locale, "SUBMIT_ASSET_SUCCEEDED"), error: frontendText(locale, "SUBMIT_ASSET_FAILED") },
      }}
      onFilesRejected={() => {
        // Two files in one drop: refuse the whole drop as "one file at a time", exactly as
        // the picker does, instead of uploading the first one silently.
        rejected.current = true;
        setValidation({ kind: "invalid", reason: "COUNT_EXCEEDED" });
      }}
      onFilesAdded={(_added, files) => {
        const refused = rejected.current;
        rejected.current = false;
        if (refused) return;
        acceptFiles(files);
      }}
      renderRow={(item) => {
        const entry = queueById.get(item.id);
        if (!entry) return null;
        return <li data-upload-status={entry.status} className="flex justify-between gap-3 text-xs">
          <span className="truncate">{displayRelativePath(entry.value)}</span>
          <span>{frontendText(locale, statusKeys[entry.status])}</span>
        </li>;
      }}
      title={frontendText(locale, "SUBMIT_ASSET_TITLE")}
      description={disabled ? (disabledMessage ?? frontendText(locale, "SUBMIT_ASSET_DISABLED")) : frontendText(locale, "SUBMIT_ASSET_DROP")}
      browseLabel={frontendText(locale, "SUBMIT_ASSET_SELECT")}
      classNames={{ queue: "mt-4 space-y-1", dropzone: "rounded-lg border-border bg-background/60 p-4" }}
    />
    {!disabled && <p className="mt-1 text-xs text-muted-foreground">{frontendText(locale, "SUBMIT_ASSET_FORMATS")}</p>}
    {validationKey && !disabled && <p role="alert" className="mt-2 text-sm text-destructive">{frontendText(locale, validationKey)}</p>}
    {showQueue && queue.length > 0 && <span className="sr-only" role="status">{frontendText(locale, "SUBMIT_ASSET_QUEUE")}</span>}
  </div>;
}
