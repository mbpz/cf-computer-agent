import { useRef, useState } from "react";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { ASSET_PICKER_ACCEPT, assetUploadModel, clipboardImageFiles } from "./asset-upload-model";
import { createAssetUploadQueue, type AssetQueueItem } from "./asset-upload-queue";

export function AssetDropzone({ locale, enabled = false, maxBytes = 10 * 1024 * 1024, onFile, onFiles }: { locale?: LocaleRuntime; enabled?: boolean; maxBytes?: number; onFile?: (file: File) => void; onFiles?: (files: File[]) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<AssetQueueItem<File>[]>([]);
  const model = assetUploadModel({ enabled, maxBytes });
  const disabled = model.kind === "disabled";
  const acceptFiles = (files: File[]) => {
    if (assetUploadModel({ enabled, maxBytes, files }).kind !== "idle") return;
    const uploadQueue = createAssetUploadQueue(files, async (file) => onFiles ? onFiles([file]) : onFile?.(file));
    setQueue(uploadQueue.items);
    if (onFiles) void uploadQueue.run().then(setQueue);
    else onFile?.(files[0]!);
  };
  return <section data-drop-target="asset" aria-disabled={disabled ? "true" : undefined} className={`rounded-lg border border-dashed bg-muted/20 p-5 ${dragging ? "ring-2 ring-primary" : ""}`} onPaste={(event) => { if (disabled) return; const files = clipboardImageFiles(Array.from(event.clipboardData.items)); if (files.length) { event.preventDefault(); acceptFiles(files); } }} onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragOver={(event) => { event.preventDefault(); }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFiles(Array.from(event.dataTransfer.files)); }}>
    <h2 className="text-sm font-semibold">{frontendText(locale, "SUBMIT_ASSET_TITLE")}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{disabled ? frontendText(locale, "SUBMIT_ASSET_DISABLED") : frontendText(locale, "SUBMIT_ASSET_DROP")}</p>
    {!disabled && <p className="mt-1 text-xs text-muted-foreground">{frontendText(locale, "SUBMIT_ASSET_FORMATS")}</p>}
    <input ref={inputRef} className="sr-only" type="file" accept={ASSET_PICKER_ACCEPT} multiple disabled={disabled} onChange={(event) => { acceptFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
    <button type="button" className="mt-4 inline-flex rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled} onClick={() => inputRef.current?.click()}>{frontendText(locale, "SUBMIT_ASSET_SELECT")}</button>
    {queue.length > 0 && <ul aria-label="Asset upload queue" className="mt-4 space-y-1 text-xs">{queue.map((item) => <li key={item.id} className="flex justify-between gap-3"><span className="truncate">{item.value.name}</span><span>{item.status}</span></li>)}</ul>}
  </section>;
}
