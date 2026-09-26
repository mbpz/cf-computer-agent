// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { xhrUploadRequester } from "../../frontend/lib/asset-upload-transport";
class FakeXHR {
  upload = { onprogress: null as null | ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) };
  onload: (() => void) | null = null; onerror: (() => void) | null = null; onabort: (() => void) | null = null; ontimeout: (() => void) | null = null;
  status = 201; responseText = '{"ok":true}'; timeout = 0; headers: Record<string,string> = {};
  open = vi.fn(); send = vi.fn(); abort = vi.fn(() => this.onabort?.());
  setRequestHeader(k: string, v: string) { this.headers[k] = v; }
  getAllResponseHeaders() { return "content-type: application/json\r\nx-request-id: test-1\r\n"; }
}
describe("real upload transport", () => {
  it("uses native byte progress, forwards headers and resolves only after the server responds", async () => {
    const xhr = new FakeXHR(); const progress = vi.fn(); const done = vi.fn();
    const request = xhrUploadRequester(progress, () => xhr as unknown as XMLHttpRequest);
    const pending = request("/api/assets", { method: "POST", body: new Blob(["hello"]), headers: { "idempotency-key": "key" } }).then(r => { done(); return r; });
    xhr.upload.onprogress!({ lengthComputable: true, loaded: 5, total: 10 }); expect(progress).toHaveBeenCalledWith(5,10); expect(done).not.toHaveBeenCalled();
    xhr.upload.onprogress!({ lengthComputable: false, loaded: 5, total: 0 }); expect(progress).toHaveBeenCalledTimes(1);
    xhr.onload!(); const response = await pending; expect(response.status).toBe(201); expect(response.headers.get("x-request-id")).toBe("test-1"); expect(await response.json()).toEqual({ ok: true }); expect(xhr.upload.onprogress).toBeNull();
  });
  it.each(["onerror", "ontimeout"] as const)("rejects %s without converting it into success", async event => {
    const xhr = new FakeXHR(); const pending = xhrUploadRequester(vi.fn(), () => xhr as unknown as XMLHttpRequest)("/api/assets", { method: "POST" }); const assertion = expect(pending).rejects.toThrow(); xhr[event]!(); await assertion;
  });
  it("aborts pending XHR and removes signal listeners", async () => {
    const xhr = new FakeXHR(); const controller = new AbortController(); const pending = xhrUploadRequester(vi.fn(), () => xhr as unknown as XMLHttpRequest)("/api/assets", { method: "POST", signal: controller.signal }); const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" }); controller.abort(); await assertion; expect(xhr.abort).toHaveBeenCalledTimes(1); expect(xhr.onload).toBeNull();
  });
  it("does not send an already-aborted request", async () => {
    const xhr = new FakeXHR(); await expect(xhrUploadRequester(vi.fn(), () => xhr as unknown as XMLHttpRequest)("/api/assets", { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" }); expect(xhr.send).not.toHaveBeenCalled();
  });
});
