// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AssetUploadView, type AssetUploadViewProps } from "../../frontend/components/assets/asset-upload-panel";
import { assetDownloadHref, loadAssetFromUrl, submitAssetAlternative, validateAssetResult, type AssetResult } from "../../frontend/lib/asset-upload-data";
import { createAssetUrlWorkflow, createAssetWorkflow } from "../../frontend/lib/asset-upload-workflow";
import { loadAssetIntent, saveAssetIntent, validAssetUrl, type AssetIntent } from "../../frontend/lib/asset-upload-intent";
import type { Fetcher } from "../../frontend/lib/api";

const storage = () => { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } }; };
type Store = ReturnType<typeof storage>;
const snapshotUrl = "https://example.test/report.html";
const hash = "a".repeat(64);
const snapshotRecord = (status: AssetResult["job"]["status"], idempotencyKey: string): AssetResult => ({ asset: { id: "asset-9", ownerId: "alice", originalName: "report.html", byteSize: 12, contentType: "text/html", contentSha256: hash, idempotencyKey }, job: { assetId: "asset-9", status } });
/** The server always echoes what the member uploaded, so the fake record has to come from the journaled intent. */
const uploadedRecord = (store: Store, status: AssetResult["job"]["status"]): AssetResult => {
  const current = loadAssetIntent("alice", store);
  if (current.kind !== "ready" || !current.intent.file) throw Error("intent missing");
  return { asset: { id: "asset-9", ownerId: "alice", originalName: current.intent.file.name.trim(), byteSize: current.intent.file.size, contentType: current.intent.file.type, contentSha256: current.intent.file.sha256, idempotencyKey: current.intent.key }, job: { assetId: "asset-9", status } };
};
const idle = { kind: "idle" as const, busy: false, uploading: false, progress: null };
const viewProps: AssetUploadViewProps = { maxBytes: 1024, title: "Attachment title", fileState: idle, urlState: idle, onFiles: async () => {}, onCreateUrl: () => {}, onRefresh: () => {}, onParse: () => {}, onCancel: () => {}, onRelease: () => {}, onStop: () => {}, onSubmit: () => {}, onAlternative: () => {} };
const render = (patch: Partial<AssetUploadViewProps> = {}) => renderToStaticMarkup(<AssetUploadView {...viewProps} {...patch} />);
const readyState = (status: AssetResult["job"]["status"]): AssetUploadViewProps["fileState"] => ({ kind: "ready", busy: false, uploading: false, progress: null, record: snapshotRecord(status, "any-key-1234567890") });

describe("asset URL snapshots and alternative text", () => {
  it("posts the snapshot URL and the alternative payload with their idempotency keys", async () => {
    const calls: { path: string; init: RequestInit }[] = [];
    const requester: Fetcher = async (input, init) => { calls.push({ path: String(input), init: init ?? {} }); return Response.json({ submission: { id: "submission-1" } }, { status: 201 }); };
    const signal = new AbortController().signal;
    await loadAssetFromUrl(snapshotUrl, "url-key-1234567890abc", requester, signal);
    expect(calls[0].path).toBe("/api/assets/from-url");
    expect(calls[0].init.method).toBe("POST");
    expect(new Headers(calls[0].init.headers).get("idempotency-key")).toBe("url-key-1234567890abc");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ url: snapshotUrl });
    const submissionId = await submitAssetAlternative("asset-9", { key: "alt-key-1234567890abc", title: "Fallback text", content: "Member text", target: { requestedSpaceId: "research", requestedCollectionId: "reports", requestedVisibility: "admin_only" } }, requester, signal);
    expect(submissionId).toBe("submission-1");
    expect(calls[1].path).toBe("/api/assets/asset-9/alternative");
    expect(calls[1].init.method).toBe("POST");
    expect(new Headers(calls[1].init.headers).get("idempotency-key")).toBe("alt-key-1234567890abc");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ requestedSpaceId: "research", requestedCollectionId: "reports", requestedVisibility: "admin_only", title: "Fallback text", content: "Member text" });
  });
  it("surfaces a rejected alternative as its own state instead of a generic request failure", async () => {
    const store = storage(); const calls: string[] = [];
    const requester: Fetcher = async (input, init) => {
      const path = String(input); calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/api/assets") return Response.json(uploadedRecord(store, "failed_retryable"), { status: 201 });
      if (path === "/api/assets/asset-9/alternative") return Response.json({ error: { code: "ASSET_ALTERNATIVE_NOT_ALLOWED", message: "not allowed", retryable: true } }, { status: 409 });
      return Response.json(uploadedRecord(store, "failed_retryable"));
    };
    const workflow = createAssetWorkflow({ memberId: "alice", maxBytes: 1024, storage: store, requester, uploadRequester: requester });
    await workflow.select(new File(["hello"], "notes.html", { type: "text/html" }));
    await workflow.alternative("Member text", "Fallback title");
    expect(calls).toEqual(["POST /api/assets", "GET /api/assets/resume", "POST /api/assets/asset-9/alternative"]);
    expect(workflow.state().error).toBe("alternative_unavailable");
    expect(workflow.state().kind).toBe("unknown");
    expect(loadAssetIntent("alice", store).kind).toBe("ready");
  });
  it("reports a storage-disabled snapshot as storage, not as a generic failure", async () => {
    const store = storage(); const calls: string[] = [];
    const requester: Fetcher = async (input, init) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      return Response.json({ error: { code: "ASSET_STORAGE_NOT_CONFIGURED", message: "storage disabled", retryable: false } }, { status: 503 });
    };
    const workflow = createAssetUrlWorkflow({ memberId: "alice", storage: store, requester });
    await workflow.create(snapshotUrl);
    expect(calls).toEqual(["POST /api/assets/from-url"]);
    expect(workflow.state().error).toBe("storage");
    expect(workflow.state().kind).toBe("unknown");
    expect(loadAssetIntent("alice", store).kind).toBe("ready");
    await workflow.create(snapshotUrl);
    expect(calls).toEqual(["POST /api/assets/from-url"]);
  });
  it("journals the URL intent before the POST and reads an unknown outcome back by the same key", async () => {
    const store = storage(); const calls: { path: string; init: RequestInit }[] = [];
    const requester: Fetcher = async (input, init) => {
      const path = String(input); calls.push({ path, init: init ?? {} });
      if (path === "/api/assets/from-url") throw Error("connection lost");
      return Response.json(snapshotRecord("succeeded", new Headers(init?.headers).get("idempotency-key") ?? ""));
    };
    const workflow = createAssetUrlWorkflow({ memberId: "alice", storage: store, requester });
    expect(workflow.state().kind).toBe("idle");
    await workflow.create(snapshotUrl);
    expect(calls.map(call => `${call.init.method} ${call.path}`)).toEqual(["POST /api/assets/from-url"]);
    expect(workflow.state().kind).toBe("unknown");
    const journaled = loadAssetIntent("alice", store);
    expect(journaled.kind === "ready" && journaled.intent.source).toEqual({ kind: "url", url: snapshotUrl });
    const key = journaled.kind === "ready" ? journaled.intent.key : "";
    expect(new Headers(calls[0].init.headers).get("idempotency-key")).toBe(key);
    await workflow.refresh();
    expect(calls.map(call => `${call.init.method} ${call.path}`)).toEqual(["POST /api/assets/from-url", "GET /api/assets/resume"]);
    expect(new Headers(calls[1].init.headers).get("idempotency-key")).toBe(key);
    expect(workflow.state().kind).toBe("ready");
    const resolved = loadAssetIntent("alice", store);
    expect(resolved.kind === "ready" && resolved.intent.file).toEqual({ name: "report.html", size: 12, type: "text/html", sha256: hash });
    await workflow.create(snapshotUrl);
    expect(calls.filter(call => call.init.method === "POST")).toHaveLength(1);
    expect(calls.map(call => call.path)).toEqual(["/api/assets/from-url", "/api/assets/resume", "/api/assets/resume"]);
  });
  it("round-trips a resolved URL intent, appends its file once and rejects mismatched bytes", () => {
    const store = storage();
    const key = "url-key-1234567890abc";
    const pending: AssetIntent = { version: 1, key, source: { kind: "url", url: snapshotUrl } };
    expect(saveAssetIntent("alice", pending, store)).toBe(true);
    expect(loadAssetIntent("alice", store)).toEqual({ kind: "ready", intent: pending });
    const resolved: AssetIntent = { ...pending, file: { name: "report.html", size: 12, type: "text/html", sha256: hash } };
    expect(saveAssetIntent("alice", resolved, store)).toBe(true);
    expect(loadAssetIntent("alice", store)).toEqual({ kind: "ready", intent: resolved });
    expect(saveAssetIntent("alice", { ...resolved, key: "other-key-1234567890" }, store)).toBe(false);
    expect(saveAssetIntent("alice", { ...resolved, source: { kind: "url", url: "https://other.test/x.html" } }, store)).toBe(false);
    expect(saveAssetIntent("alice", { ...resolved, file: { name: "report.html", size: 12, type: "text/html", sha256: "b".repeat(64) } }, store)).toBe(false);
    expect(loadAssetIntent("alice", store)).toEqual({ kind: "ready", intent: resolved });
    expect(validateAssetResult(snapshotRecord("succeeded", key), "alice", resolved)).toMatchObject({ asset: { id: "asset-9" } });
    expect(() => validateAssetResult(snapshotRecord("succeeded", key), "bob", resolved)).toThrow("ASSET_RESPONSE_INVALID");
    expect(() => validateAssetResult(snapshotRecord("succeeded", "other-key-1234567890"), "alice", resolved)).toThrow("ASSET_RESPONSE_INVALID");
    expect(() => validateAssetResult({ ...snapshotRecord("succeeded", key), asset: { ...snapshotRecord("succeeded", key).asset, contentSha256: "b".repeat(64) } }, "alice", resolved)).toThrow("ASSET_RESPONSE_INVALID");
    expect(validateAssetResult(snapshotRecord("succeeded", key), "alice", pending)).toMatchObject({ job: { status: "succeeded" } });
    const other = storage();
    expect(saveAssetIntent("alice", { version: 1, key }, other)).toBe(false);
    expect(saveAssetIntent("alice", { version: 1, key, source: { kind: "url", url: "javascript:alert(1)" } }, other)).toBe(false);
    expect(validAssetUrl("https://example.test/a")).toBe(true);
    expect(validAssetUrl("http://example.test/a")).toBe(true);
    expect(validAssetUrl(`https://example.test/${"a".repeat(2048)}`)).toBe(false);
    expect(validAssetUrl("https://example.test/\n")).toBe(false);
  });
  it("builds cookie-authenticated download paths with an encoded asset id", () => {
    expect(assetDownloadHref("asset-9", "original")).toBe("/api/assets/asset-9/original");
    expect(assetDownloadHref("asset/9 1", "parsed")).toBe("/api/assets/asset%2F9%201/parsed");
  });
  it("renders the URL form, the failed-parse alternative form and the available downloads only", () => {
    const empty = render();
    expect(empty).toContain("data-asset-url-input");
    expect(empty).toContain("data-asset-url-submit");
    expect(empty).toContain("data-asset-url-status");
    expect(empty).not.toContain("data-asset-alternative-input");
    expect(empty).not.toContain("data-asset-original-link");
    expect(empty).not.toContain("data-asset-parsed-link");
    for (const status of ["queued", "processing", "succeeded"] as const) {
      const html = render({ fileState: readyState(status) });
      expect(html).toContain("data-asset-original-link");
      expect(html).toContain("/api/assets/asset-9/original");
      expect(html).not.toContain("data-asset-alternative-input");
      expect(html.includes("data-asset-parsed-link")).toBe(status === "succeeded");
      expect(html.includes("/api/assets/asset-9/parsed")).toBe(status === "succeeded");
    }
    for (const status of ["failed_retryable", "failed_terminal"] as const) {
      const html = render({ fileState: readyState(status) });
      expect(html).toContain("data-asset-alternative-input");
      expect(html).toContain("data-asset-alternative-submit");
      expect(html).toContain("data-asset-original-link");
      expect(html).not.toContain("data-asset-parsed-link");
      expect(html).not.toContain("data-asset-url-retry");
    }
    const pendingUrl = { kind: "unknown" as const, busy: false, uploading: false, progress: null, intent: { version: 1 as const, key: "url-key-1234567890abc", source: { kind: "url" as const, url: snapshotUrl } } };
    const pending = render({ fileState: pendingUrl, urlState: pendingUrl });
    expect(pending).toContain("data-asset-url-retry");
    expect(pending).toContain(snapshotUrl);
    expect(pending).not.toContain("data-asset-error");
    expect(render({ fileState: pendingUrl, urlState: { ...pendingUrl, error: "storage" } })).toContain('data-asset-error="ASSET_URL_STORAGE"');
    expect(render({ fileState: pendingUrl, urlState: { ...pendingUrl, error: "storage" } })).not.toContain('data-asset-error="ASSET_FLOW_STORAGE"');
    expect(render({ fileState: idle, urlState: { ...idle, error: "validation" } })).toContain('data-asset-url-status="ASSET_URL_INVALID"');
    expect(render({ fileState: idle, urlState: { ...idle, error: "validation" } })).not.toContain("data-asset-error");
    expect(render({ fileState: { ...idle, error: "validation" } })).toContain('data-asset-error="SUBMIT_ASSET_INVALID"');
    expect(render({ fileState: readyState("failed_retryable"), alternativeErrorKey: "ASSET_ALT_FLOW_ERROR" })).toContain("data-asset-alternative-error");
    expect(render({ alternativeErrorKey: "ASSET_ALT_FLOW_ERROR" })).not.toContain("data-asset-alternative-error");
  });
});
