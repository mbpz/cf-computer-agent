import { useEffect, useRef, useState } from "react";
import type { SubmissionTarget } from "../../lib/submission-data";
import { assetDownloadHref } from "../../lib/asset-upload-data";
import { createAssetUrlWorkflow, createAssetWorkflow, type AssetUrlWorkflow, type AssetWorkflow, type AssetWorkflowError, type AssetWorkflowState } from "../../lib/asset-upload-workflow";
import { xhrUploadRequester } from "../../lib/asset-upload-transport";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import { AssetDropzone } from "./asset-dropzone";

const idleState: AssetWorkflowState = { kind: "idle", busy: false, uploading: false, progress: null };
const errorKeys: Record<AssetWorkflowError, string> = { storage: "ASSET_FLOW_STORAGE", validation: "SUBMIT_ASSET_INVALID", different_file: "ASSET_FLOW_DIFFERENT", request: "ASSET_FLOW_ERROR", cancel_conflict: "ASSET_FLOW_CANCEL_CONFLICT", not_ready: "ASSET_FLOW_NOT_READY", alternative_unavailable: "ASSET_ALTERNATIVE_UNAVAILABLE" };
/** The URL snapshot's own wording replaces the recovery-storage and generic request messages for its failures. */
function urlErrorKey(error: AssetWorkflowError | undefined): string | undefined {
  return error === "storage" ? "ASSET_URL_STORAGE" : error === "validation" ? "ASSET_URL_INVALID" : error === "request" ? "ASSET_URL_ERROR" : undefined;
}
export type AssetUploadViewProps = {
  maxBytes: number; title: string; locale?: LocaleRuntime;
  fileState: AssetWorkflowState; urlState: AssetWorkflowState; alternativeErrorKey?: string;
  onFiles: (files: File[]) => Promise<void>; onCreateUrl: (url: string) => void; onRefresh: () => void; onParse: () => void;
  onCancel: () => void; onRelease: () => void; onStop: () => void; onSubmit: () => void; onAlternative: (content: string) => void;
};
/** Presentational view: every action is an explicit prop call, and the URL workflow reports its own state. */
export function AssetUploadView({ maxBytes, title, locale, fileState, urlState, alternativeErrorKey, onFiles, onCreateUrl, onRefresh, onParse, onCancel, onRelease, onStop, onSubmit, onAlternative }: AssetUploadViewProps) {
  const [url, setUrl] = useState(""); const [alternative, setAlternative] = useState("");
  const text = (key: string) => frontendText(locale, key);
  const usingUrl = urlState.kind !== "idle";
  const state = usingUrl ? urlState : fileState;
  const job = state.record?.job.status;
  const urlStatusKey = usingUrl
    ? (urlState.kind === "unknown" ? "ASSET_URL_UNKNOWN" : urlState.kind === "ready" ? "ASSET_URL_CREATED" : "")
    : urlErrorKey(urlState.error) ?? "";
  const errorKey = usingUrl ? urlErrorKey(state.error) ?? (state.error ? errorKeys[state.error] : undefined) : state.error ? errorKeys[state.error] : undefined;
  return <div data-asset-workflow={state.kind} aria-busy={state.busy} className="space-y-3">
    <AssetDropzone locale={locale} maxBytes={maxBytes} showQueue={false} disabledMessage={text(state.busy || usingUrl ? "ASSET_FLOW_BUSY" : "ASSET_FLOW_STORAGE")} enabled={!state.busy && state.error !== "storage" && !usingUrl} onFiles={onFiles} />
    <form data-asset-url-form className="space-y-2 text-sm" onSubmit={event => { event.preventDefault(); onCreateUrl(url); }}>
      <p className="font-medium">{text("ASSET_URL_TITLE")}</p>
      <label className="block" htmlFor="asset-url-input">{text("ASSET_URL_LABEL")}
        <input id="asset-url-input" data-asset-url-input type="url" inputMode="url" maxLength={2048} value={url} disabled={state.busy} className="mt-1 w-full rounded-md border px-2 py-1" onChange={event => setUrl(event.target.value)} />
      </label>
      <button type="submit" data-asset-url-submit disabled={state.busy || state.error === "storage"} className="rounded-md border px-3 py-2">{text("ASSET_URL_SUBMIT")}</button>
      <p data-asset-url-status={urlStatusKey} className="text-muted-foreground">{text(urlStatusKey)}</p>
      {usingUrl && (urlState.kind === "unknown" || urlState.kind === "missing") && urlState.error !== "storage" && <button type="button" data-asset-url-retry disabled={state.busy} className="rounded-md border px-3 py-2" onClick={onRefresh}>{text("ASSET_URL_RECHECK")}</button>}
    </form>
    <div role="status" aria-live="polite" className="space-y-2 text-sm">
      {state.intent && <p className="break-words">{state.intent.file?.name ?? state.intent.source?.url}{state.intent.review ? ` — ${state.intent.review.title}` : ""}</p>}
      {state.uploading && <><p>{text("ASSET_FLOW_TRANSPORT")}</p><progress aria-label={text("ASSET_FLOW_TRANSPORT")} max={100} value={state.progress ?? undefined} className="w-full" />{state.progress !== null && <span>{state.progress}%</span>}</>}
      {state.kind === "unknown" && !state.uploading && !usingUrl && <p>{text("ASSET_FLOW_UNKNOWN")}</p>}
      {state.kind === "missing" && <p>{text("ASSET_FLOW_MISSING")}</p>}
      {job && <p>{text(`ASSET_JOB_${job.toUpperCase()}`)}</p>}
      {state.kind === "released" && <p>{text("ASSET_FLOW_RELEASED")}</p>}
      {state.kind === "canceled" && <p>{text("ASSET_FLOW_CANCELED")}</p>}
      {state.kind === "submitted" && <p>{text("ASSET_FLOW_SUBMITTED")} <a href="/my-submissions" className="underline">{text("SUBMIT_CHECK_SUBMISSIONS")}</a></p>}
    </div>
    {errorKey && <p role="alert" data-asset-error={errorKey} className="text-sm text-destructive">{text(errorKey)}</p>}
    {state.record && <div className="flex flex-wrap gap-3 text-sm">
      <a data-asset-original-link className="underline" href={assetDownloadHref(state.record.asset.id, "original")}>{text("ASSET_ORIGINAL_DOWNLOAD")}</a>
      {job === "succeeded" && <a data-asset-parsed-link className="underline" href={assetDownloadHref(state.record.asset.id, "parsed")}>{text("ASSET_PARSED_DOWNLOAD")}</a>}
    </div>}
    <div className="flex flex-wrap gap-2">
      {state.uploading && <button type="button" data-asset-stop className="rounded-md border px-3 py-2 text-sm" onClick={onStop}>{text("ASSET_FLOW_STOP")}</button>}
      {state.intent && <button type="button" data-asset-refresh disabled={state.busy || state.error === "storage"} className="rounded-md border px-3 py-2 text-sm" onClick={onRefresh}>{text("ASSET_FLOW_REFRESH")}</button>}
      {(job === "queued" || job === "failed_retryable") && <>
        <button type="button" data-asset-parse disabled={state.busy || state.error === "storage"} className="rounded-md border px-3 py-2 text-sm" onClick={onParse}>{text("ASSET_FLOW_PARSE")}</button>
        <button type="button" data-asset-cancel disabled={state.busy || state.error === "storage"} className="rounded-md border px-3 py-2 text-sm" onClick={onCancel}>{text("ASSET_FLOW_CANCEL")}</button>
      </>}
      {job === "failed_terminal" && <button type="button" data-asset-release disabled={state.busy || state.error === "storage"} className="rounded-md border px-3 py-2 text-sm" onClick={onRelease}>{text("ASSET_FLOW_RELEASE")}</button>}
      {job === "succeeded" && <button type="button" data-asset-submit disabled={state.busy || state.error === "storage" || (!state.intent?.review && !title.trim())} className="rounded-md border px-3 py-2 text-sm" onClick={onSubmit}>{text("ASSET_FLOW_SUBMIT")}</button>}
    </div>
    {(job === "failed_retryable" || job === "failed_terminal") && <form data-asset-alternative-form className="space-y-2 text-sm" onSubmit={event => { event.preventDefault(); onAlternative(alternative); }}>
      <p className="font-medium">{text("ASSET_ALTERNATIVE_TITLE")}</p>
      <p className="text-muted-foreground">{text("ASSET_ALTERNATIVE_HINT")}</p>
      <label className="block" htmlFor="asset-alternative-input">{text("ASSET_ALTERNATIVE_LABEL")}
        <textarea id="asset-alternative-input" data-asset-alternative-input rows={4} value={alternative} disabled={state.busy} className="mt-1 w-full rounded-md border px-2 py-1" onChange={event => setAlternative(event.target.value)} />
      </label>
      {alternativeErrorKey && <p role="alert" data-asset-alternative-error className="text-destructive">{text(alternativeErrorKey)}</p>}
      <button type="submit" data-asset-alternative-submit disabled={state.busy || state.error === "storage" || !alternative.trim() || !title.trim()} className="rounded-md border px-3 py-2">{text("ASSET_ALTERNATIVE_SUBMIT")}</button>
    </form>}
  </div>;
}
export function AssetUploadPanel({ memberId, maxBytes, title, locale, target }: { memberId: string; maxBytes: number; title: string; locale?: LocaleRuntime; target?: SubmissionTarget | null }) {
  const [fileState, setFileState] = useState<AssetWorkflowState>(idleState);
  const [urlState, setUrlState] = useState<AssetWorkflowState>(idleState);
  const [alternativeAttempted, setAlternativeAttempted] = useState(false);
  const fileFlow = useRef<AssetWorkflow | null>(null);
  const urlFlow = useRef<AssetUrlWorkflow | null>(null);
  useEffect(() => {
    const files = createAssetWorkflow({ memberId, maxBytes, onChange: setFileState, uploadRequester: xhrUploadRequester((loaded, total) => files.progress(loaded, total)) });
    const urls = createAssetUrlWorkflow({ memberId, onChange: setUrlState });
    fileFlow.current = files; urlFlow.current = urls; setFileState(files.state()); setUrlState(urls.state());
    return () => { files.dispose(); urls.dispose(); if (fileFlow.current === files) fileFlow.current = null; if (urlFlow.current === urls) urlFlow.current = null; };
  }, [memberId, maxBytes]);
  const active = () => (urlState.kind !== "idle" ? urlFlow.current : fileFlow.current);
  const attempt = (action: () => void) => { setAlternativeAttempted(false); action(); };
  // A missing picker target keeps the submit path on its historical default destination.
  const destination = target ?? undefined;
  const activeError = urlState.kind !== "idle" ? urlState.error : fileState.error;
  const alternativeError = !alternativeAttempted ? undefined : activeError === "validation" ? "ASSET_ALTERNATIVE_INVALID" : activeError === "request" ? "ASSET_ALT_FLOW_ERROR" : undefined;
  return <AssetUploadView maxBytes={maxBytes} title={title} locale={locale} fileState={fileState} urlState={urlState} alternativeErrorKey={alternativeError}
    onFiles={async files => { const file = files[0]; if (file) attempt(() => { void fileFlow.current?.select(file); }); }}
    onCreateUrl={value => { attempt(() => { void urlFlow.current?.create(value); }); }}
    onRefresh={() => { attempt(() => { void active()?.refresh(); }); }}
    onParse={() => { attempt(() => { void active()?.parse(); }); }}
    onCancel={() => { attempt(() => { void active()?.cancel(); }); }}
    onRelease={() => { attempt(() => { void active()?.releaseFailed(); }); }}
    onStop={() => { active()?.stop(); }}
    onSubmit={() => { attempt(() => { void active()?.submit(title, destination); }); }}
    onAlternative={content => { setAlternativeAttempted(true); void active()?.alternative(content, title, destination); }} />;
}
