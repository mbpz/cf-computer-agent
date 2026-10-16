import { validateSubmissionTarget, type SubmissionTarget } from "./submission-data";
import { assetUploadModel } from "../components/assets/asset-upload-model";
import { ApiRequestError, type Fetcher } from "./api";
import { assetContentType, assetResultFile, cancelAsset, loadAssetFromUrl, parseAsset, resumeAsset, submitAsset, submitAssetAlternative, uploadAsset, validateAssetResult, type AssetAlternativeReview, type AssetResult } from "./asset-upload-data";
import { clearAssetIntent, describeAssetFile, loadAssetIntent, newAssetKey, saveAssetIntent, validAssetUrl, type AssetFileDescription, type AssetIntent, type AssetIntentStorage } from "./asset-upload-intent";
export type AssetWorkflowError = "storage" | "validation" | "different_file" | "request" | "cancel_conflict" | "not_ready" | "alternative_unavailable";
export type AssetWorkflowState = { kind: "idle" | "unknown" | "ready" | "missing" | "canceled" | "submitted" | "released"; busy: boolean; uploading: boolean; progress: number | null; intent?: AssetIntent; record?: AssetResult; error?: AssetWorkflowError; submissionId?: string };
export type AssetWorkflowOptions = { memberId: string; maxBytes: number; storage?: AssetIntentStorage; requester?: Fetcher; uploadRequester: Fetcher; onChange?: (state: AssetWorkflowState) => void };
export type AssetUrlWorkflowOptions = { memberId: string; storage?: AssetIntentStorage; requester?: Fetcher; onChange?: (state: AssetWorkflowState) => void };
export interface AssetWorkflow {
  state(): AssetWorkflowState;
  progress(loaded: number, total: number): void;
  select(file: File): Promise<void>;
  refresh(): Promise<void>;
  parse(): Promise<void>;
  cancel(): Promise<void>;
  releaseFailed(): Promise<void>;
  submit(title: string, target?: SubmissionTarget): Promise<void>;
  alternative(content: string, title: string, target?: SubmissionTarget): Promise<void>;
  stop(): void;
  dispose(): void;
}
export interface AssetUrlWorkflow {
  state(): AssetWorkflowState;
  create(url: string): Promise<void>;
  refresh(): Promise<void>;
  parse(): Promise<void>;
  cancel(): Promise<void>;
  releaseFailed(): Promise<void>;
  submit(title: string, target?: SubmissionTarget): Promise<void>;
  alternative(content: string, title: string, target?: SubmissionTarget): Promise<void>;
  stop(): void;
  dispose(): void;
}
const maxTitleBytes = 512;
/** Server-side storage and a rejected alternative both deserve their own message, not a generic failure. */
function classifiedError(error: unknown): AssetWorkflowError {
  const code = error instanceof ApiRequestError ? error.code : undefined;
  if (code === "ASSET_STORAGE_NOT_CONFIGURED" || (error instanceof Error && error.message === "ASSET_INTENT_CHANGED")) return "storage";
  if (code === "ASSET_CANCEL_CONFLICT") return "cancel_conflict";
  if (code === "ASSET_ALTERNATIVE_NOT_ALLOWED") return "alternative_unavailable";
  return "request";
}
/** Only a failed parse exposes the alternative path; every field is re-sent byte-for-byte on retry. */
function planAlternative(intent: AssetIntent, record: AssetResult, content: string, title: string, target?: SubmissionTarget): { review: AssetAlternativeReview } | { failure: AssetWorkflowError } {
  if (record.job.status !== "failed_retryable" && record.job.status !== "failed_terminal") return { failure: "not_ready" };
  const existing = intent.review;
  if (existing) {
    if (existing.content === undefined) return { failure: "not_ready" };
    return { review: { key: existing.key, title: existing.title, content: existing.content, ...(existing.target ? { target: existing.target } : {}) } };
  }
  const text = content.trim();
  if (!title.trim() || new TextEncoder().encode(title.trim()).byteLength > maxTitleBytes || !text) return { failure: "validation" };
  let destination: SubmissionTarget | undefined;
  try { destination = target === undefined ? undefined : validateSubmissionTarget(target); } catch { return { failure: "validation" }; }
  return { review: { key: newAssetKey(), title: title.trim(), content: text, ...(destination ? { target: destination } : {}) } };
}
/** Only explicit user actions mutate. Recovery/readback never automatically replays a POST. */
export function createAssetWorkflow(options: AssetWorkflowOptions): AssetWorkflow {
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
    try { await action(controller.signal); } catch (error) { if (valid(controller.signal)) emit({ kind: state.intent ? "unknown" : "idle", record: undefined, error: classifiedError(error) }); }
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
        if (state.intent.file === undefined || JSON.stringify(state.intent.file) !== JSON.stringify(description)) { emit({ error: "different_file" }); return; }
        if (await read(signal) || !valid(signal)) return;
      } else if (!persist({ version: 1, key: newAssetKey(), file: description })) return;
      const intent = state.intent; if (!valid(signal) || !intent?.file) return;
      // The check above proved the description exists; only URL intents may omit it.
      const described = intent as AssetIntent & { file: AssetFileDescription };
      emit({ kind: "unknown", record: undefined, uploading: true, progress: null });
      const result = validateAssetResult(await uploadAsset(file, described, uploadRequester, signal), memberId, intent);
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
    submit(title: string, target?: SubmissionTarget) { return run(async signal => {
      const record = await read(signal); if (!record || !valid(signal) || !state.intent) return;
      if (record.job.status !== "succeeded") { emit({ error: "not_ready" }); return; }
      let review = state.intent.review;
      if (!review) {
        if (!title.trim() || new TextEncoder().encode(title.trim()).byteLength > maxTitleBytes) { emit({ error: "validation" }); return; }
        let destination: SubmissionTarget | undefined;
        try { destination = target === undefined ? undefined : validateSubmissionTarget(target); }
        catch { emit({ error: "validation" }); return; }
        review = { key: newAssetKey(), title: title.trim(), ...(destination ? { target: destination } : {}) };
        if (!persist({ ...state.intent, review })) return;
      }
      const submissionId = await submitAsset(record.asset.id, review, requester, signal);
      if (valid(signal) && clear()) emit({ kind: "submitted", record: undefined, submissionId, progress: null });
    }); },
    alternative(content: string, title: string, target?: SubmissionTarget) { return run(async signal => {
      const record = await read(signal); if (!record || !valid(signal) || !state.intent) return;
      const plan = planAlternative(state.intent, record, content, title, target);
      if ("failure" in plan) { emit({ error: plan.failure }); return; }
      if (!state.intent.review && !persist({ ...state.intent, review: plan.review })) return;
      const submissionId = await submitAssetAlternative(record.asset.id, plan.review, requester, signal);
      if (valid(signal) && clear()) emit({ kind: "submitted", record: undefined, submissionId, progress: null });
    }); },
    stop() { if (active) { active.abort(); emit({ kind: state.intent ? "unknown" : "idle", record: undefined, progress: null }); } },
    dispose() { disposed = true; active?.abort(); },
  };
  return workflow;
}
/** URL-sourced snapshots: the intent is journaled before the POST so an unknown outcome is read back, never re-fetched. */
export function createAssetUrlWorkflow(options: AssetUrlWorkflowOptions): AssetUrlWorkflow {
  const { memberId, storage } = options; const requester = options.requester ?? fetch;
  const loaded = loadAssetIntent(memberId, storage);
  const urlIntent = loaded.kind === "ready" && loaded.intent.source?.kind === "url" ? loaded.intent : undefined;
  let state: AssetWorkflowState = { kind: urlIntent ? "unknown" : "idle", busy: false, uploading: false, progress: null, ...(urlIntent ? { intent: urlIntent } : {}) };
  let active: AbortController | undefined; let disposed = false;
  const emit = (patch: Partial<AssetWorkflowState>) => { if (!disposed) { state = { ...state, ...patch }; options.onChange?.(state); } };
  const valid = (signal: AbortSignal) => !disposed && !signal.aborted;
  function persist(intent: AssetIntent) { if (!saveAssetIntent(memberId, intent, storage)) { emit({ error: "storage" }); return false; } emit({ intent }); return true; }
  function clear() { if (!state.intent || !clearAssetIntent(memberId, state.intent.key, storage)) { emit({ error: "storage" }); return false; } emit({ intent: undefined }); return true; }
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (disposed || active || state.error === "storage") return;
    const controller = new AbortController(); active = controller; emit({ busy: true, error: undefined });
    try { await action(controller.signal); } catch (error) { if (valid(controller.signal)) emit({ kind: state.intent ? "unknown" : "idle", record: undefined, error: classifiedError(error) }); }
    finally { if (active === controller) { active = undefined; emit({ busy: false, uploading: false }); } }
  }
  /** A confirmed read is also the only place a URL intent learns its resolved file description. */
  async function read(signal: AbortSignal): Promise<AssetResult | undefined> {
    if (!state.intent) return;
    const current = loadAssetIntent(memberId, storage);
    if (current.kind !== "ready" || JSON.stringify(current.intent) !== JSON.stringify(state.intent)) { emit({ error: "storage" }); throw Error("ASSET_INTENT_CHANGED"); }
    try {
      const result = validateAssetResult(await resumeAsset(state.intent.key, requester, signal), memberId, state.intent);
      if (!valid(signal)) return;
      if (!state.intent.file && !persist({ ...state.intent, file: assetResultFile(result) })) return;
      emit({ kind: "ready", record: result }); return result;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404 && error.code === "ASSET_NOT_FOUND") { if (valid(signal)) emit({ kind: "missing", record: undefined }); return; } throw error;
    }
  }
  const workflow = {
    state: () => state,
    create(url: string) { return run(async signal => {
      const trimmed = url.trim();
      if (!validAssetUrl(trimmed)) { emit({ error: "validation" }); return; }
      if (state.intent) {
        if (state.intent.source?.url !== trimmed) { emit({ error: "different_file" }); return; }
        if (await read(signal) || !valid(signal)) return;
      } else if (!persist({ version: 1, key: newAssetKey(), source: { kind: "url", url: trimmed } })) return;
      const intent = state.intent; if (!valid(signal) || !intent?.source) return;
      emit({ kind: "unknown", record: undefined, uploading: true, progress: null });
      const result = validateAssetResult(await loadAssetFromUrl(intent.source.url, intent.key, requester, signal), memberId, intent);
      if (!valid(signal)) return;
      if (!intent.file && !persist({ ...intent, file: assetResultFile(result) })) return;
      emit({ kind: "ready", record: result });
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
    submit(title: string, target?: SubmissionTarget) { return run(async signal => {
      const record = await read(signal); if (!record || !valid(signal) || !state.intent) return;
      if (record.job.status !== "succeeded") { emit({ error: "not_ready" }); return; }
      let review = state.intent.review;
      if (!review) {
        if (!title.trim() || new TextEncoder().encode(title.trim()).byteLength > maxTitleBytes) { emit({ error: "validation" }); return; }
        let destination: SubmissionTarget | undefined;
        try { destination = target === undefined ? undefined : validateSubmissionTarget(target); }
        catch { emit({ error: "validation" }); return; }
        review = { key: newAssetKey(), title: title.trim(), ...(destination ? { target: destination } : {}) };
        if (!persist({ ...state.intent, review })) return;
      }
      const submissionId = await submitAsset(record.asset.id, review, requester, signal);
      if (valid(signal) && clear()) emit({ kind: "submitted", record: undefined, submissionId, progress: null });
    }); },
    alternative(content: string, title: string, target?: SubmissionTarget) { return run(async signal => {
      const record = await read(signal); if (!record || !valid(signal) || !state.intent) return;
      const plan = planAlternative(state.intent, record, content, title, target);
      if ("failure" in plan) { emit({ error: plan.failure }); return; }
      if (!state.intent.review && !persist({ ...state.intent, review: plan.review })) return;
      const submissionId = await submitAssetAlternative(record.asset.id, plan.review, requester, signal);
      if (valid(signal) && clear()) emit({ kind: "submitted", record: undefined, submissionId, progress: null });
    }); },
    stop() { if (active) { active.abort(); emit({ kind: state.intent ? "unknown" : "idle", record: undefined, progress: null }); } },
    dispose() { disposed = true; active?.abort(); },
  };
  return workflow;
}
