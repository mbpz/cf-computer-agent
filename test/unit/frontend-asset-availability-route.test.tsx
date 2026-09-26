// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { SubmitRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { createMaturityRouteFetch } from "../helpers/workbench-maturity-route-fixtures";

const disabled = { storageEnabled: false, reason: "ASSET_STORAGE_NOT_CONFIGURED", maxBytes: 1024 };
describe("asset availability route", () => {
  let journey: MountedApp | undefined;
  afterEach(async () => { await journey?.unmount(); journey = undefined; });
  async function open(read: typeof fetch) {
    const fallback = createMaturityRouteFetch({ routeId: "submit", state: "ready", role: "contributor", permissionMask: "0x0" });
    journey = await mountAuthenticatedApp({ url: "https://app.test/submit", role: "contributor", permissionMask: "0x0",
      fetch: (input, init) => String(input) === "/api/assets/availability" ? read(input, init) : fallback(input, init) });
    await waitForApp(() => Boolean(journey!.container.querySelector("#submission-content")));
    return journey;
  }
  const panel = () => journey!.container.querySelector("[data-asset-availability]")!;
  const state = () => panel()?.getAttribute("data-asset-availability");
  it.each([false, true])("shows configuration without prematurely enabling uploads: %s", async enabled => {
    await open(async () => Response.json({ ...disabled, storageEnabled: enabled, reason: enabled ? null : disabled.reason }));
    await waitForApp(() => state() === "ready");
    expect(panel().textContent).toContain("1024");
    expect(panel().textContent).toContain(enabled ? "not connected" : "not configured");
    expect((panel().querySelector('input[type="file"]') as HTMLInputElement).disabled).toBe(true);
    expect((journey!.container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });
  it("distinguishes loading and failure, retries only GET, and prevents duplicate retries", async () => {
    let finish!: (response: Response) => void;
    const calls: RequestInit[] = [];
    await open(async (_input, init) => { calls.push(init!); return new Promise(resolve => { finish = resolve; }); });
    expect(state()).toBe("loading");
    expect(panel().textContent).not.toContain("not configured");
    await act(async () => { finish(Response.json({}, { status: 503 })); });
    await waitForApp(() => state() === "error");
    expect(panel().textContent).not.toContain("not configured");
    await act(async () => {
      const retry = panel().querySelector("[data-asset-availability-retry]") as HTMLButtonElement;
      expect(retry.type).toBe("button"); retry.click(); retry.click();
    });
    expect(calls).toHaveLength(2);
    expect(calls.every(init => init.method === "GET")).toBe(true);
    await act(async () => { finish(Response.json(disabled)); });
    await waitForApp(() => state() === "ready");
  });
  it("aborts old member reads and ignores late results after a member switch", async () => {
    const requests: { signal: AbortSignal; finish: (response: Response) => void }[] = [];
    await open(async (_input, init) => new Promise(finish => requests.push({ signal: init!.signal!, finish })));
    await act(async () => { journey!.root.render(<SubmitRoute locale={createLocaleRuntime({ storedLocale: "zh-CN" })} memberId="other-member" />); });
    expect(requests[0].signal.aborted).toBe(true);
    expect(requests).toHaveLength(2);
    await act(async () => { requests[1].finish(Response.json({}, { status: 403 })); });
    await waitForApp(() => state() === "error");
    await act(async () => { requests[0].finish(Response.json(disabled)); });
    expect(state()).toBe("error");
    expect(panel().textContent).toContain("读取附件可用性失败");
    expect((panel().querySelector('input[type="file"]') as HTMLInputElement).disabled).toBe(true);
  });
});
