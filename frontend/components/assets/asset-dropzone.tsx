import { useRef } from "react";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { ASSET_PICKER_ACCEPT, assetUploadModel } from "./asset-upload-model";

export function AssetDropzone({ locale, enabled = false, maxBytes = 10 * 1024 * 1024, onFile }: { locale?: LocaleRuntime; enabled?: boolean; maxBytes?: number; onFile?: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const model = assetUploadModel({ enabled, maxBytes });
  const disabled = model.kind === "disabled";
  return <section aria-disabled={disabled ? "true" : undefined} className="rounded-lg border border-dashed bg-muted/20 p-5">
    <h2 className="text-sm font-semibold">{frontendText(locale, "SUBMIT_ASSET_TITLE")}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{disabled ? frontendText(locale, "SUBMIT_ASSET_DISABLED") : frontendText(locale, "SUBMIT_ASSET_DROP")}</p>
    {!disabled && <p className="mt-1 text-xs text-muted-foreground">{frontendText(locale, "SUBMIT_ASSET_FORMATS")}</p>}
    <input ref={inputRef} className="sr-only" type="file" accept={ASSET_PICKER_ACCEPT} disabled={disabled} onChange={(event) => { const files = Array.from(event.target.files ?? []); const file = files[0]; if (file && assetUploadModel({ enabled, maxBytes, files }).kind === "idle") onFile?.(file); }} />
    <button type="button" className="mt-4 inline-flex rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled} onClick={() => inputRef.current?.click()}>{frontendText(locale, "SUBMIT_ASSET_SELECT")}</button>
  </section>;
}
