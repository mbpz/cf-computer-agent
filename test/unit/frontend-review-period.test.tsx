// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extendedPayload } from "../helpers/workbench-extended-route-fixtures";
import { mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({default: {sanitize: (html: string) => html}}));

describe("review period request ownership", () => {
  let journey: MountedApp | undefined;
  let reads: {period: string; signal?: AbortSignal | null; resolve: (response: Response) => void; reject: (error: Error) => void}[];
  afterEach(async () => { await journey?.unmount(); journey = undefined; });
  const main = () => journey!.container.querySelector("main")!;
  const button = (label: string) => [...main().querySelectorAll("button")].find(node => node.textContent === label)!;
  async function mount() {
    reads = [];
    journey = await mountAuthenticatedApp({url: "https://app.test/review", role: "contributor", permissionMask: "0x100000", fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      if (url.pathname === "/api/navigation") return Response.json({tree: currentNavigationFixture("contributor", "0x100000")});
      if (url.pathname === "/api/telemetry/pageview") return new Response(null, {status: 204});
      expect(url.pathname).toBe("/api/workbench/review");
      return new Promise<Response>((resolve, reject) => reads.push({period: url.searchParams.get("period")!, signal: init?.signal, resolve, reject}));
    }});
    await waitForApp(() => reads.length === 1);
  }
  async function resolve(index: number, marker: string, period = reads[index]!.period) {
    await act(async () => reads[index]!.resolve(Response.json({...extendedPayload("review", false, marker), period, ...(period === "weekly" ? {periodKey: "2026-W37", from: "2026-09-07T00:00:00.000Z"} : {})})));
    if (index === reads.length - 1) await waitForApp(() => main().textContent?.includes(`READY::review::${marker}`) === true || main().querySelector('[role="alert"]') !== null);
  }
  async function click(label: string) { await act(async () => button(label).click()); }

  it("refreshes the selected ready period, clears stale data and can retry a failed refresh", async () => {
    await mount(); await resolve(0,"initial"); await click("Weekly"); await resolve(1,"week-before-refresh");
    await click("Refresh review");
    await waitForApp(() => reads.length === 3);
    expect(main().textContent).not.toContain("week-before-refresh");
    expect(reads[2]?.period).toBe("weekly");
    await act(async () => reads[2]!.resolve(apiError(500, "INTERNAL_ERROR", true)));
    await waitForApp(() => main().querySelector('[role="alert"]') !== null);
    await click("Try review again"); await waitForApp(() => reads.length === 4); await resolve(3,"week-after-refresh");
    expect(main().textContent).toContain("week-after-refresh");
  });

  it("hides the daily snapshot while weekly is pending and renders only the weekly receipt", async () => {
    await mount(); await resolve(0, "daily");
    await click("Weekly");
    expect(reads[1]!.period).toBe("weekly");
    expect(main().querySelector('[data-page-state="loading"]')).not.toBeNull();
    expect(main().textContent).not.toContain("READY::review::daily");
    await resolve(1, "weekly");
    expect(main().textContent).toContain("READY::review::weekly");
  });

  it.each(["success", "failure"])("ignores late weekly %s after switching back to daily", async outcome => {
    await mount(); await resolve(0, "first"); await click("Weekly");
    await click("Daily");
    expect(reads.map(read => read.period)).toEqual(["daily", "weekly", "daily"]);
    expect(reads[1]!.signal?.aborted).toBe(true);
    await resolve(2, "latest");
    if (outcome === "success") await resolve(1, "stale");
    else await act(async () => reads[1]!.reject(new Error("Late network failure")));
    // Allow response body parsing and the obsolete promise chain to settle.
    await waitForApp(() => true);
    expect(main().textContent).toContain("READY::review::latest");
    expect(main().textContent).not.toContain("READY::review::stale");
    expect(main().querySelector('[role="alert"]')).toBeNull();
  });

  it("retries the selected weekly period after failure, without restoring a daily snapshot", async () => {
    await mount(); await resolve(0, "daily"); await click("Weekly");
    await act(async () => reads[1]!.resolve(apiError(503, "SERVICE_UNAVAILABLE", true)));
    await waitForApp(() => main().querySelector('[role="alert"] button') !== null);
    expect(main().textContent).not.toContain("READY::review::daily");
    await act(async () => (main().querySelector('[role="alert"] button') as HTMLButtonElement).click());
    expect(reads[2]!.period).toBe("weekly");
    await resolve(2, "retry");
    expect(main().textContent).toContain("READY::review::retry");
  });

  it("rejects a snapshot for the wrong requested period", async () => {
    await mount(); await resolve(0, "daily"); await click("Weekly");
    await resolve(1, "wrong", "daily");
    expect(main().querySelector('[role="alert"]')).not.toBeNull();
    expect(main().textContent).not.toContain("READY::review::wrong");
  });

  it("aborts its pending request on unmount", async () => {
    await mount(); const signal = reads[0]!.signal;
    await journey!.unmount(); journey = undefined;
    expect(signal?.aborted).toBe(true);
    await act(async () => reads[0]!.reject(new Error("Settled after unmount")));
  });
});
