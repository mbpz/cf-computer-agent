import { useEffect, useRef, useState } from "react";
import { createAssetWorkflow, type AssetWorkflowState } from "../../lib/asset-upload-workflow";
import { xhrUploadRequester } from "../../lib/asset-upload-transport";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { AssetDropzone } from "./asset-dropzone";

export function AssetUploadPanel({ memberId, maxBytes, title, locale }: { memberId: string; maxBytes: number; title: string; locale?: LocaleRuntime }) {
  const [state, setState] = useState<AssetWorkflowState>({ kind: "idle", busy: false, uploading: false, progress: null });
  const workflow = useRef<ReturnType<typeof createAssetWorkflow> | null>(null);
  useEffect(() => {
    const current = createAssetWorkflow({ memberId, maxBytes, onChange: setState, uploadRequester: xhrUploadRequester((loaded, total) => current.progress(loaded, total)) });
    workflow.current = current; setState(current.state());
    return () => { current.dispose(); if (workflow.current === current) workflow.current = null; };
  }, [memberId, maxBytes]);
  const job = state.record?.job.status;
  const text = (key: string) => frontendText(locale, key);
  const errors = { storage: "ASSET_FLOW_STORAGE", validation: "SUBMIT_ASSET_INVALID", different_file: "ASSET_FLOW_DIFFERENT", request: "ASSET_FLOW_ERROR", cancel_conflict: "ASSET_FLOW_CANCEL_CONFLICT", not_ready: "ASSET_FLOW_NOT_READY" } as const;
  return <div data-asset-workflow={state.kind} aria-busy={state.busy} className="space-y-3">
    <AssetDropzone locale={locale} maxBytes={maxBytes} showQueue={false} disabledMessage={text(state.busy ? "ASSET_FLOW_BUSY" : "ASSET_FLOW_STORAGE")} enabled={!state.busy && state.error !== "storage"} onFiles={async files => { if (files[0]) await workflow.current?.select(files[0]); }} />
    <div role="status" aria-live="polite" className="space-y-2 text-sm">
      {state.intent && <p className="break-words">{state.intent.file.name}{state.intent.review ? ` — ${state.intent.review.title}` : ""}</p>}
      {state.uploading && <><p>{text("ASSET_FLOW_TRANSPORT")}</p><progress aria-label={text("ASSET_FLOW_TRANSPORT")} max={100} value={state.progress ?? undefined} className="w-full" />{state.progress !== null && <span>{state.progress}%</span>}</>}
      {state.kind === "unknown" && !state.uploading && <p>{text("ASSET_FLOW_UNKNOWN")}</p>}
      {state.kind === "missing" && <p>{text("ASSET_FLOW_MISSING")}</p>}
      {job && <p>{text(`ASSET_JOB_${job.toUpperCase()}`)}</p>}
      {state.kind === "released" && <p>{text("ASSET_FLOW_RELEASED")}</p>}
      {state.kind === "canceled" && <p>{text("ASSET_FLOW_CANCELED")}</p>}
      {state.kind === "submitted" && <p>{text("ASSET_FLOW_SUBMITTED")} <a href="/my-submissions" className="underline">{text("SUBMIT_CHECK_SUBMISSIONS")}</a></p>}
    </div>
    {state.error && <p role="alert" className="text-sm text-destructive">{text(errors[state.error])}</p>}
    <div className="flex flex-wrap gap-2">
      {state.uploading && <button type="button" data-asset-stop className="rounded-md border px-3 py-2 text-sm" onClick={() => workflow.current?.stop()}>{text("ASSET_FLOW_STOP")}</button>}
      {state.intent && <button type="button" data-asset-refresh disabled={state.busy || state.error === "storage"} className="rounded-md border px-3 py-2 text-sm" onClick={() => { void workflow.current?.refresh(); }}>{text("ASSET_FLOW_REFRESH")}</button>}
      {(job === "queued" || job === "failed_retryable") && <>
        <button type="button" data-asset-parse disabled={state.busy || state.error === "storage"} className="rounded-md border px-3 py-2 text-sm" onClick={() => { void workflow.current?.parse(); }}>{text("ASSET_FLOW_PARSE")}</button>
        <button type="button" data-asset-cancel disabled={state.busy || state.error === "storage"} className="rounded-md border px-3 py-2 text-sm" onClick={() => { void workflow.current?.cancel(); }}>{text("ASSET_FLOW_CANCEL")}</button>
      </>}
      {job === "failed_terminal" && <button type="button" data-asset-release disabled={state.busy || state.error === "storage"} className="rounded-md border px-3 py-2 text-sm" onClick={() => { void workflow.current?.releaseFailed(); }}>{text("ASSET_FLOW_RELEASE")}</button>}
      {job === "succeeded" && <button type="button" data-asset-submit disabled={state.busy || state.error === "storage" || (!state.intent?.review && !title.trim())} className="rounded-md border px-3 py-2 text-sm" onClick={() => { void workflow.current?.submit(title); }}>{text("ASSET_FLOW_SUBMIT")}</button>}
    </div>
  </div>;
}
