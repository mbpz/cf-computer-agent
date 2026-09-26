import { useEffect, useRef, useState } from "react";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { ASSET_PICKER_ACCEPT, assetUploadModel, clipboardImageFiles, displayRelativePath } from "./asset-upload-model";
import { createAssetUploadQueue, type AssetQueueItem } from "./asset-upload-queue";

export function AssetDropzone({ locale, disabledMessage, enabled = false, folderMode = false, maxBytes = 10 * 1024 * 1024, showQueue = true, onFile, onFiles }: { locale?: LocaleRuntime; disabledMessage?: string; enabled?: boolean; folderMode?: boolean; maxBytes?: number; showQueue?: boolean; onFile?: (file: File) => void; onFiles?: (files: File[]) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<AssetQueueItem<File>[]>([]);
  const [validation, setValidation] = useState<ReturnType<typeof assetUploadModel>>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
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
  return <section data-drop-target="asset" aria-disabled={disabled ? "true" : undefined} aria-busy={busy} className={`rounded-lg border border-dashed bg-muted/20 p-5 ${dragging ? "ring-2 ring-primary" : ""}`} onPaste={(event) => { if (disabled || busy) return; const files = clipboardImageFiles(Array.from(event.clipboardData.items)); if (files.length) { event.preventDefault(); acceptFiles(files); } }} onDragEnter={(event) => { event.preventDefault(); if (!disabled && !busy) setDragging(true); }} onDragOver={(event) => { event.preventDefault(); }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFiles(Array.from(event.dataTransfer.files)); }}>
    <h2 className="text-sm font-semibold">{frontendText(locale, "SUBMIT_ASSET_TITLE")}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{disabled ? (disabledMessage ?? frontendText(locale, "SUBMIT_ASSET_DISABLED")) : frontendText(locale, "SUBMIT_ASSET_DROP")}</p>
    {!disabled && <p className="mt-1 text-xs text-muted-foreground">{frontendText(locale, "SUBMIT_ASSET_FORMATS")}</p>}
    {validationKey && !disabled && <p role="alert" className="mt-2 text-sm text-destructive">{frontendText(locale, validationKey)}</p>}
    <input ref={inputRef} className="sr-only" type="file" accept={ASSET_PICKER_ACCEPT} disabled={disabled || busy} {...(folderMode ? ({ webkitdirectory: "" } as Record<string, string>) : {})} onChange={(event) => { acceptFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
    <button type="button" className="mt-4 inline-flex rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled || busy} onClick={() => inputRef.current?.click()}>{frontendText(locale, "SUBMIT_ASSET_SELECT")}</button>
    {showQueue && queue.length > 0 && <ul aria-label={frontendText(locale, "SUBMIT_ASSET_QUEUE")} aria-live="polite" className="mt-4 space-y-1 text-xs">{queue.map((item) => <li key={item.id} data-upload-status={item.status} className="flex justify-between gap-3"><span className="truncate">{displayRelativePath(item.value)}</span><span>{frontendText(locale, statusKeys[item.status])}</span></li>)}</ul>}
  </section>;
}
