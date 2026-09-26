// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubmitRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { loadAssetIntent } from "../../frontend/lib/asset-upload-intent";
import { saveOfflineSubmissionDraft } from "../../frontend/lib/offline-submission-draft";
import { mountApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { createMaturityRouteFetch } from "../helpers/workbench-maturity-route-fixtures";

class UploadXHR {
  static calls: UploadXHR[] = [];
  headers = new Headers(); body?: Blob; status = 201; responseText = ""; timeout = 0;
  upload = { onprogress: null as null | ((e: { loaded: number; total: number; lengthComputable: boolean }) => void) };
  onload: (() => void) | null = null; onerror: (() => void) | null = null; onabort: (() => void) | null = null; ontimeout: (() => void) | null = null;
  open(method: string, path: string) { expect(method).toBe("POST"); expect(path).toBe("/api/assets"); }
  setRequestHeader(k: string, v: string) { this.headers.set(k,v); }
  getAllResponseHeaders() { return "content-type: application/json"; }
  send(body: Blob) { this.body = body; UploadXHR.calls.push(this); }
  abort() { this.onabort?.(); }
}
describe("wired attachment submission route", () => {
  let journey: MountedApp | undefined; let calls: { path: string; init: RequestInit }[]; let status: string;
  afterEach(async () => { await journey?.unmount(); journey = undefined; });
  function serverResult(owner = "member-a") {
    const loaded = loadAssetIntent(owner, journey!.browser.localStorage); if (loaded.kind !== "ready") throw Error("intent missing");
    return { asset: { id: "asset-1", ownerId: owner, originalName: loaded.intent.file.name.trim(), byteSize: loaded.intent.file.size, contentType: loaded.intent.file.type, contentSha256: loaded.intent.file.sha256, idempotencyKey: loaded.intent.key }, job: { assetId: "asset-1", status } };
  }
  async function open() {
    UploadXHR.calls = []; calls = []; status = "queued"; vi.stubGlobal("XMLHttpRequest", UploadXHR);
    const fallback = createMaturityRouteFetch({ routeId: "submit", state: "ready", role: "contributor", permissionMask: "0x0" });
    journey = await mountApp({ url: "https://app.test/submit", configureBrowser(browser) { saveOfflineSubmissionDraft("member-a", { title: "Attachment title", content: "Independent text draft", mode: "text" }, browser.localStorage); }, fetch: async (input, init) => {
      const path = String(input);
      if (path === "/api/session") return Response.json({ member: { id: "member-a", email: "a@app.test", role: "contributor" }, capabilities: ["knowledge:read", "submission:create", "submission:read-own"], permissionMask: "0x0", logoutUrl: "/auth/logout" });
      if (path === "/api/assets/availability") return Response.json({ storageEnabled: true, reason: null, maxBytes: 1024 });
      if (path.startsWith("/api/assets/")) {
        calls.push({ path, init: init! });
        if (path === "/api/assets/asset-1") status = "succeeded";
        if (path.endsWith("/submit")) return Response.json({ submission: { id: "submission-1" } }, { status: 201 });
        return Response.json(serverResult());
      }
      return fallback(input, init);
    } });
    await waitForApp(() => Boolean(journey!.container.querySelector("[data-asset-workflow]")));
  }
  async function drop(files: File[]) {
    await act(async () => { const event = new journey!.browser.Event("drop", { bubbles: true, cancelable: true }); Object.defineProperty(event,"dataTransfer",{ value: { files } }); journey!.container.querySelector('[data-drop-target="asset"]')!.dispatchEvent(event); });
  }
  const flow = () => journey!.container.querySelector("[data-asset-workflow]")!;
  const kind = () => flow().getAttribute("data-asset-workflow");
  async function click(selector: string, twice = false) { await act(async () => { const button = flow().querySelector(selector) as HTMLButtonElement; expect(button.type).toBe("button"); button.click(); if (twice) button.click(); }); }
  async function choose() { await drop([new File(["hello"], "笔记.txt", { type: "text/plain" })]); await waitForApp(() => UploadXHR.calls.length === 1); }
  async function accept() { await act(async () => { const xhr = UploadXHR.calls[0]; xhr.responseText = JSON.stringify(serverResult()); xhr.onload!(); }); await waitForApp(() => kind() === "ready"); }
  it("validates at the real entry without sending an upload and retains text submission", async () => {
    await open(); await drop([new File(["a"], "bad.exe")]); expect(flow().textContent).toContain("not supported");
    await drop([new File(["a"], "a.txt"), new File(["a"], "b.txt")]); expect(flow().textContent).toContain("one file");
    await drop([new File([new Uint8Array(1025)], "large.txt")]); expect(flow().textContent).toContain("upload limit");
    expect(UploadXHR.calls).toHaveLength(0); expect((journey!.container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });
  it("uploads with byte progress, reads parse completion and submits the attachment, not the text draft", async () => {
    await open(); await choose(); const xhr = UploadXHR.calls[0];
    expect(xhr.headers.get("x-asset-name")).toBe(encodeURIComponent("笔记.txt"));
    await act(async () => { xhr.upload.onprogress!({ loaded: 5, total: 5, lengthComputable: true }); });
    expect(flow().textContent).toContain("100%"); expect(kind()).toBe("unknown"); expect(flow().querySelector("[data-asset-submit]")).toBeNull();
    await accept(); await click("[data-asset-parse]", true); await waitForApp(() => Boolean(flow().querySelector("[data-asset-submit]")));
    await click("[data-asset-submit]", true); await waitForApp(() => kind() === "submitted");
    expect(calls.filter(c => c.init.method === "POST").map(c => c.path)).toEqual(["/api/assets/asset-1", "/api/assets/asset-1/submit"]);
    const submitted = calls.find(c => c.path.endsWith("/submit"))!; expect(JSON.parse(String(submitted.init.body)).title).toBe("Attachment title");
    expect((journey!.container.querySelector("#submission-content") as HTMLTextAreaElement).value).toBe("Independent text draft");
    expect(loadAssetIntent("member-a", journey!.browser.localStorage).kind).toBe("empty");
  });
  it("remounts an unresolved upload without automatic POST and hides it from another member", async () => {
    await open(); await choose(); await click("[data-asset-stop]"); await waitForApp(() => flow().getAttribute("aria-busy") === "false");
    expect(kind()).toBe("unknown"); expect(flow().textContent).not.toContain("confirmed cancellation");
    await act(async () => { journey!.root.render(<SubmitRoute memberId="member-b" locale={createLocaleRuntime()} />); }); await waitForApp(() => Boolean(flow()));
    expect(flow().textContent).not.toContain("笔记.txt"); expect(flow().querySelector("[data-asset-refresh]")).toBeNull();
    await act(async () => { journey!.root.render(<SubmitRoute memberId="member-a" locale={createLocaleRuntime()} />); }); await waitForApp(() => kind() === "unknown");
    expect(UploadXHR.calls).toHaveLength(1); expect(calls).toHaveLength(0);
    await click("[data-asset-refresh]"); await waitForApp(() => kind() === "ready"); expect(calls.map(c => c.init.method)).toEqual(["GET"]);
  });
});
