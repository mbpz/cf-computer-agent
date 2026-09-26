import { assetUploadModel } from "../components/assets/asset-upload-model";
import { ApiRequestError, type Fetcher } from "./api";
import { assetContentType, cancelAsset, parseAsset, resumeAsset, submitAsset, uploadAsset, validateAssetResult, type AssetResult } from "./asset-upload-data";
import { clearAssetIntent, describeAssetFile, loadAssetIntent, newAssetKey, saveAssetIntent, type AssetIntent, type AssetIntentStorage } from "./asset-upload-intent";
export type AssetWorkflowState = { kind: "idle" | "unknown" | "ready" | "missing" | "canceled" | "submitted" | "released"; busy: boolean; uploading: boolean; progress: number | null; intent?: AssetIntent; record?: AssetResult; error?: "storage" | "validation" | "different_file" | "request" | "cancel_conflict" | "not_ready"; submissionId?: string };
export type AssetWorkflowOptions = { memberId: string; maxBytes: number; storage?: AssetIntentStorage; requester?: Fetcher; uploadRequester: Fetcher; onChange?: (state: AssetWorkflowState) => void };
/** Only explicit user actions mutate. Recovery/readback never automatically replays a POST. */
export function createAssetWorkflow(options: AssetWorkflowOptions) {
  const { memberId, storage, maxBytes, uploadRequester } = options; const requester = options.requester ?? fetch;
  const loaded = loadAssetIntent(memberId, storage);
  let state: AssetWorkflowState = { kind: loaded.kind === "ready" ? "unknown" : "idle", busy: false, uploading: false, progress: null, ...(loaded.kind === "ready" ? { intent: loaded.intent } : loaded.kind === "empty" ? {} : { error: "storage" as const }) };
  let active: AbortController | undefined; let disposed = false;
  const emit = (patch: Partial<AssetWorkflowState>) => { if (!disposed) { state = { ...state, ...patch }; options.onChange?.(state); } };
  const valid = (signal: AbortSignal) => !disposed && !signal.aborted;
  function persist(intent: AssetIntent) { if (!saveAssetIntent(memberId, intent, storage)) { emit({ error: "storage" }); return false; } emit({ intent }); return true; }
  function clear() { if (!state.intent || !clearAssetIntent(memberId, state.intent.key, storage)) { emit({ error: "storage" }); return false; } emit({ intent: undefined }); return true; }
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (disposed || active || state.error === "storage") return;
    const controller = new AbortController(); active = controller; emit({ busy: true, error: undefined });
    try { await action(controller.signal); } catch (error) { if (valid(controller.signal)) emit({ kind: state.intent ? "unknown" : "idle", record: undefined, error: error instanceof Error && error.message === "ASSET_INTENT_CHANGED" ? "storage" : error instanceof ApiRequestError && error.code === "ASSET_CANCEL_CONFLICT" ? "cancel_conflict" : "request" }); }
    finally { if (active === controller) { active = undefined; emit({ busy: false, uploading: false }); } }
  }
  async function read(signal: AbortSignal): Promise<AssetResult | undefined> {
    if (!state.intent) return;
    // Detect another tab replacing/clearing our recovery record before sending a mutation.
    const current = loadAssetIntent(memberId, storage);
    if (current.kind !== "ready" || JSON.stringify(current.intent) !== JSON.stringify(state.intent)) { emit({ error: "storage" }); throw Error("ASSET_INTENT_CHANGED"); }
    try {
      const result = validateAssetResult(await resumeAsset(state.intent.key, requester, signal), memberId, state.intent);
      if (!valid(signal)) return; emit({ kind: "ready", record: result }); return result;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404 && error.code === "ASSET_NOT_FOUND") { if (valid(signal)) emit({ kind: "missing", record: undefined }); return; } throw error;
    }
  }
  const workflow = {
    state: () => state,
    progress(loaded: number, total: number) { if (state.uploading && active && !active.signal.aborted && total > 0 && loaded >= 0) emit({ progress: Math.min(100, Math.floor(loaded / total * 100)) }); },
    select(file: File) { return run(async signal => {
      if (assetUploadModel({ enabled: true, file, maxBytes }).kind !== "idle" || file.size === 0 || file.name.length > 200 || /[\/\\\u0000-\u001f\u007f]/u.test(file.name)) { emit({ error: "validation" }); return; }
      const description = await describeAssetFile(file, assetContentType(file)); if (!valid(signal)) return;
      if (state.intent) {
        if (JSON.stringify(state.intent.file) !== JSON.stringify(description)) { emit({ error: "different_file" }); return; }
        if (await read(signal) || !valid(signal)) return;
      } else if (!persist({ version: 1, key: newAssetKey(), file: description })) return;
      if (!valid(signal) || !state.intent) return;
      emit({ kind: "unknown", record: undefined, uploading: true, progress: null });
      const result = validateAssetResult(await uploadAsset(file, state.intent, uploadRequester, signal), memberId, state.intent);
      if (valid(signal)) emit({ kind: "ready", record: result });
    }); },
    refresh() { return run(async signal => { await read(signal); }); },
    parse() { return run(async signal => {
      const record = await read(signal); if (!record || !valid(signal) || !state.intent) return;
      if (!["queued", "failed_retryable"].includes(record.job.status)) return;
      const result = validateAssetResult(await parseAsset(record.asset.id, requester, signal), memberId, state.intent);
      if (valid(signal)) emit({ kind: "ready", record: result });
    }); },
    cancel() { return run(async signal => {
      const record = await read(signal); if (!record || !valid(signal)) return;
      if (!["queued", "failed_retryable"].includes(record.job.status)) { emit({ error: "cancel_conflict" }); return; }
      await cancelAsset(record.asset.id, requester, signal);
      if (valid(signal) && clear()) emit({ kind: "canceled", record: undefined, progress: null });
    }); },
    releaseFailed() { return run(async signal => {
      const record = await read(signal); if (!record || !valid(signal)) return;
      if (record.job.status !== "failed_terminal") { emit({ error: "not_ready" }); return; }
      if (clear()) emit({ kind: "released", record: undefined, progress: null });
    }); },
    submit(title: string) { return run(async signal => {
      const record = await read(signal); if (!record || !valid(signal) || !state.intent) return;
      if (record.job.status !== "succeeded") { emit({ error: "not_ready" }); return; }
      if (!state.intent.review) {
        if (!title.trim() || new TextEncoder().encode(title.trim()).byteLength > 512) { emit({ error: "validation" }); return; }
        if (!persist({ ...state.intent, review: { key: newAssetKey(), title: title.trim() } })) return;
      }
      const submissionId = await submitAsset(record.asset.id, state.intent.review!, requester, signal);
      if (valid(signal) && clear()) emit({ kind: "submitted", record: undefined, submissionId, progress: null });
    }); },
    stop() { if (active) { active.abort(); emit({ kind: state.intent ? "unknown" : "idle", record: undefined, progress: null }); } },
    dispose() { disposed = true; active?.abort(); },
  };
  return workflow;
}
