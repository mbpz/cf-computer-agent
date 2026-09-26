// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createAssetWorkflow, type AssetWorkflowOptions } from "../../frontend/lib/asset-upload-workflow";
import { loadAssetIntent, saveAssetIntent } from "../../frontend/lib/asset-upload-intent";
import { assetUploadModel } from "../../frontend/components/assets/asset-upload-model";

const storage = () => { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k,v); }, removeItem: (k: string) => { values.delete(k); } }; };
const file = () => new File(["hello"], "笔记.txt", { type: "text/plain" });
const record = (status = "queued") => ({ asset: { id: "asset-1", ownerId: "alice", originalName: "笔记.txt", byteSize: 5, contentType: "text/plain", contentSha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", idempotencyKey: "" }, job: { assetId: "asset-1", status } });
function setup(extra: Partial<AssetWorkflowOptions> = {}) {
  const store = storage(); const requests: { path: string; init: RequestInit }[] = [];
  const requester = vi.fn(async (path, init) => { requests.push({ path: String(path), init: init! }); const result = record(); result.asset.idempotencyKey = new Headers(init?.headers).get("idempotency-key") ?? ""; return Response.json(result); });
  const options = { memberId: "alice", maxBytes: 1024, storage: store, requester, uploadRequester: requester, ...extra };
  return { workflow: createAssetWorkflow(options), store, requester, requests, options };
}
describe("member asset workflow", () => {
  it("allows explicitly releasing only a verified terminal failure without deleting the server asset", async () => {
    const ctx = setup(); await ctx.workflow.select(file()); await ctx.workflow.releaseFailed(); expect(loadAssetIntent("alice",ctx.store).kind).toBe("ready");
    const loaded = loadAssetIntent("alice",ctx.store); if (loaded.kind !== "ready") throw Error("missing");
    ctx.requester.mockImplementation(async () => { const r = record("failed_terminal"); r.asset.idempotencyKey = loaded.intent.key; return Response.json(r); });
    await ctx.workflow.releaseFailed(); expect(ctx.workflow.state().kind).toBe("released"); expect(loadAssetIntent("alice",ctx.store).kind).toBe("empty"); expect(ctx.requester.mock.calls.slice(1).every(([,init]) => init?.method === "GET")).toBe(true);
  });
  it("rejects cross-member or inconsistent server responses instead of exposing or acting on them", async () => {
    const ctx = setup({ uploadRequester: async () => Response.json({ ...record(), asset: { ...record().asset, ownerId: "bob" } }) }); await ctx.workflow.select(file()); expect(ctx.workflow.state().kind).toBe("unknown"); expect(ctx.workflow.state().record).toBeUndefined(); expect(ctx.workflow.state().error).toBe("request");
  });

  it.each([new File([], "empty.txt"), new File(["x"], "bad/name.txt"), new File(["x"], "a".repeat(201) + ".txt")])("rejects empty and unsafe filenames in the picker before transport", async file => {
    expect(assetUploadModel({ enabled: true, maxBytes: 1024, file }).kind).toBe("invalid");
    const ctx = setup(); await ctx.workflow.select(file); expect(ctx.requester).not.toHaveBeenCalled(); expect(ctx.workflow.state().error).toBe("validation");
  });
  it("fails closed if another tab removes the recovery record", async () => {
    const ctx = setup(); await ctx.workflow.select(file()); ctx.store.removeItem("personal-workbench:asset-intent:v1:alice");
    await ctx.workflow.refresh(); expect(ctx.workflow.state().error).toBe("storage"); await ctx.workflow.select(file()); expect(ctx.requester).toHaveBeenCalledTimes(1);
  });
  it("reads parse responses and only permits explicit retryable-job execution", async () => {
    const ctx = setup(); await ctx.workflow.select(file()); let processing = false;
    ctx.requester.mockImplementation(async (p, i) => { if (String(p) === "/api/assets/asset-1") processing = true; const r = record(processing ? "succeeded" : "queued"); const loaded = loadAssetIntent("alice", ctx.store); r.asset.idempotencyKey = loaded.kind === "ready" ? loaded.intent.key : ""; return Response.json(r); });
    await Promise.all([ctx.workflow.parse(), ctx.workflow.parse()]); expect(ctx.workflow.state().record?.job.status).toBe("succeeded"); expect(ctx.requester.mock.calls.filter(([p]) => String(p) === "/api/assets/asset-1")).toHaveLength(1);
  });
  it("disposal cancels readback and cannot publish an old member result", async () => {
    const changed = vi.fn(); const ctx = setup({ onChange: changed }); await ctx.workflow.select(file()); let finish!: (response: Response) => void; let signal!: AbortSignal;
    ctx.requester.mockImplementation(async (_p,i) => { signal = i!.signal!; return new Promise(resolve => { finish = resolve; }); }); const pending = ctx.workflow.refresh();
    ctx.workflow.dispose(); const count = changed.mock.calls.length; finish(Response.json(record("succeeded"))); await pending; expect(signal.aborted).toBe(true); expect(changed).toHaveBeenCalledTimes(count);
  });

  it("persists before upload, encodes Unicode filename, tracks actual progress and never auto parses", async () => {
    const ctx = setup(); await ctx.workflow.select(file());
    expect(ctx.requests.map(r => r.path)).toEqual(["/api/assets"]);
    expect(loadAssetIntent("alice", ctx.store).kind).toBe("ready");
    expect(loadAssetIntent("bob", ctx.store).kind).toBe("empty");
    expect(new Headers(ctx.requests[0].init.headers).get("x-asset-name")).toBe(encodeURIComponent("笔记.txt"));
    expect(ctx.workflow.state().record?.job.status).toBe("queued");
  });
  it("fails closed when recovery storage cannot be written", async () => {
    const ctx = setup({ storage: { getItem: () => null, setItem: () => { throw Error("quota"); }, removeItem: () => {} } });
    await ctx.workflow.select(file()); expect(ctx.requester).not.toHaveBeenCalled(); expect(ctx.workflow.state().error).toBe("storage");
  });
  it("reconciles a lost upload on refresh without replaying POST or generating another key", async () => {
    let key = "";
    const ctx = setup({ uploadRequester: async (_p, init) => { key = new Headers(init?.headers).get("idempotency-key")!; throw Error("lost"); } });
    await ctx.workflow.select(file()); expect(ctx.workflow.state().kind).toBe("unknown");
    const next = createAssetWorkflow(ctx.options); expect(next.state().kind).toBe("unknown"); await next.refresh();
    expect(ctx.requests).toHaveLength(1); expect(ctx.requests[0].path).toBe("/api/assets/resume"); expect(ctx.requests[0].init.method).toBe("GET");
    expect(new Headers(ctx.requests[0].init.headers).get("idempotency-key")).toBe(key);
    expect(next.state().kind).toBe("ready");
  });
  it("requires identical file bytes before explicit retry, and reuses a missing upload key", async () => {
    const keys: string[] = [];
    const ctx = setup({ requester: async () => Response.json({ error: { code: "ASSET_NOT_FOUND", message: "missing", retryable: false } }, { status: 404 }), uploadRequester: async (_p, init) => { keys.push(new Headers(init?.headers).get("idempotency-key")!); throw Error("lost"); } });
    await ctx.workflow.select(file()); await ctx.workflow.select(new File(["other"], "笔记.txt", { type: "text/plain" })); expect(keys).toHaveLength(1); expect(ctx.workflow.state().error).toBe("different_file");
    await ctx.workflow.select(file()); expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
  });
  it("does not treat transport abort as server cancellation and ignores late upload responses", async () => {
    let finish!: (r: Response) => void; let signal!: AbortSignal;
    const ctx = setup({ uploadRequester: async (_p, init) => { signal = init!.signal!; return new Promise(resolve => { finish = resolve; }); } });
    const pending = ctx.workflow.select(file()); await vi.waitFor(() => expect(finish).toBeDefined()); ctx.workflow.stop(); expect(signal.aborted).toBe(true);
    finish(Response.json(record())); await pending; expect(ctx.workflow.state().kind).toBe("unknown"); expect(loadAssetIntent("alice", ctx.store).kind).toBe("ready");
  });
  it("guards duplicate clicks synchronously", async () => {
    const ctx = setup(); await Promise.all([ctx.workflow.select(file()), ctx.workflow.select(file())]); expect(ctx.requester).toHaveBeenCalledTimes(1);
  });
  it("does not send cancellation for a processing job", async () => {
    const ctx = setup(); await ctx.workflow.select(file()); ctx.requester.mockImplementation(async (_p, init) => { const r = record("processing"); r.asset.idempotencyKey = new Headers(init?.headers).get("idempotency-key")!; return Response.json(r); });
    await ctx.workflow.cancel(); expect(ctx.workflow.state().kind).toBe("ready"); expect(ctx.workflow.state().error).toBe("cancel_conflict"); expect(loadAssetIntent("alice", ctx.store).kind).toBe("ready");
  });
  it("clears only after server acknowledges cancellation", async () => {
    const ctx = setup(); await ctx.workflow.select(file()); const first = ctx.requester.getMockImplementation()!;
    ctx.requester.mockImplementation(async (p, i) => String(p).endsWith("/cancel") ? new Response(null, { status: 204 }) : first(p,i));
    await ctx.workflow.cancel(); expect(ctx.workflow.state().kind).toBe("canceled"); expect(loadAssetIntent("alice", ctx.store).kind).toBe("empty");
  });
  it("requires successful parse, preserves exact review intent after response loss, and submits only once", async () => {
    const ctx = setup(); await ctx.workflow.select(file()); await ctx.workflow.submit("Review title"); expect(ctx.workflow.state().error).toBe("not_ready");
    const bodies: string[] = []; const keys: string[] = [];
    ctx.requester.mockImplementation(async (p, i) => {
      if (String(p).endsWith("/submit")) { bodies.push(String(i!.body)); keys.push(new Headers(i?.headers).get("idempotency-key")!); if (bodies.length === 1) throw Error("lost"); return Response.json({ submission: { id: "submission-1" } }); }
      const r = record("succeeded"); r.asset.idempotencyKey = new Headers(i?.headers).get("idempotency-key")!; return Response.json(r);
    });
    await ctx.workflow.submit("Review title"); const next = createAssetWorkflow(ctx.options); await Promise.all([next.submit("Changed title"), next.submit("Changed title")]);
    expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]); expect(keys[1]).toBe(keys[0]); expect(next.state().kind).toBe("submitted"); expect(loadAssetIntent("alice",ctx.store).kind).toBe("empty");
  });
  it("keeps authorization failures visible without uploading on failed reconciliation", async () => {
    const ctx = setup(); await ctx.workflow.select(file()); ctx.requester.mockResolvedValue(Response.json({}, { status: 403 })); await ctx.workflow.select(file()); expect(ctx.workflow.state().error).toBe("request"); expect(ctx.requester).toHaveBeenCalledTimes(2);
  });
  it("rejects corrupt persisted intents and never overwrites another pending intent", async () => {
    const ctx = setup(); await ctx.workflow.select(file()); const current = loadAssetIntent("alice", ctx.store); if (current.kind !== "ready") throw Error("missing");
    expect(saveAssetIntent("alice", { ...current.intent, key: "another-key-123456" }, ctx.store)).toBe(false);
    ctx.store.setItem("personal-workbench:asset-intent:v1:alice", "{}"); const next = createAssetWorkflow(ctx.options); await next.select(file()); expect(next.state().error).toBe("storage"); expect(ctx.requester).toHaveBeenCalledTimes(1);
  });
});
