// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuditRoute, AdminMembersRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import type { AdminMember, AdminMembersPage, LoadAdminMembersInput } from "../../frontend/lib/admin-members-data";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("numbered admin routes", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(() => { browser = new Window({ url: "https://app.test/admin/members" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("restores member status and pagination from URL and aborts stale requests", async () => {
    browser.history.replaceState({}, "", "/admin/members?status=disabled&page=2&pageSize=20");
    const requests: Array<{ url: string; signal?: AbortSignal }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { requests.push({ url: String(input), signal: init?.signal || undefined }); return response("member", 2, 20, 21); });
    await act(async () => root.render(<AdminMembersRoute locale={locale()} search={browser.location.search} />)); await flush();
    expect(requests.at(-1)?.url).toContain("status=disabled"); expect(requests.at(-1)?.url).toContain("page=2");
    await act(async () => { browser.history.pushState({}, "", "/admin/members?status=active&pageSize=50"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect(requests[0]?.signal?.aborted).toBe(true); expect(requests.at(-1)?.url).toContain("status=active"); expect(requests.at(-1)?.url).toContain("pageSize=50");
  });

  it("persists audit action while changing numbered pages", async () => {
    browser.history.replaceState({}, "", "/admin/audit?action=member.login&pageSize=20");
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => response("audit", String(input).includes("page=2") ? 2 : 1, 20, 21));
    await act(async () => root.render(<AdminAuditRoute locale={locale()} search={browser.location.search} />)); await flush();
    await waitFor(() => container.querySelector('[aria-busy="true"]') === null);
    expect(container.textContent).toContain("member.login");
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    await click('button[aria-label="Page 2"]'); await flush();
    await waitFor(() => container.textContent?.includes("21–21") === true);
    expect(browser.location.search).toContain("action=member.login"); expect(browser.location.search).toContain("page=2");
    expect(container.textContent).toContain("21–21");
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe("2");
  });

  it("renders an empty audit result with zero pagination", async () => {
    vi.stubGlobal("fetch", async () => response("audit", 1, 20, 0));
    await act(async () => root.render(<AdminAuditRoute locale={locale()} search="" />)); await flush();
    await waitFor(() => container.querySelector('[data-page-state="empty"]') !== null);
    expect(container.querySelector('[data-page-state="empty"]')).not.toBeNull();
    expect(container.textContent).toContain("0–0");
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("retries an initial audit error with the same URL and suppresses duplicate clicks", async () => {
    browser.history.replaceState({}, "", "/admin/audit?action=member.login&page=2&pageSize=50");
    const requests = auditRequests();
    await act(async () => root.render(<AdminAuditRoute locale={locale()} search={browser.location.search} />));
    requests[0]!.pending.reject(new Error("offline"));
    await waitFor(() => container.querySelector('[role="alert"]') !== null);
    const retry = container.querySelector('[role="alert"] button') as HTMLButtonElement | null;
    expect(retry).not.toBeNull();
    await act(async () => { retry!.click(); retry!.click(); });
    expect(requests.map(({ url }) => url)).toEqual([
      "/api/admin/audit-events?page=2&pageSize=50&action=member.login",
      "/api/admin/audit-events?page=2&pageSize=50&action=member.login",
    ]);
    expect(container.querySelector('[role="alert"] button:disabled')).not.toBeNull();
    requests[1]!.pending.resolve(response("audit", 2, 50, 51));
    await waitFor(() => container.textContent?.includes("51–51") === true);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(browser.location.search).toBe("?action=member.login&page=2&pageSize=50");
  });

  it("retains the last audit page on pagination failure and retries the requested page", async () => {
    browser.history.replaceState({}, "", "/admin/audit?action=member.login");
    const requests = auditRequests();
    await act(async () => root.render(<AdminAuditRoute locale={locale()} search={browser.location.search} />));
    requests[0]!.pending.resolve(response("audit", 1, 20, 21));
    await waitFor(() => container.textContent?.includes("1–20") === true);
    await click('button[aria-label="Page 2"]');
    expect(container.querySelector('select[aria-label="Audit action"]:disabled')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Page 2"]:disabled')).not.toBeNull();
    requests[1]!.pending.reject(new Error("offline"));
    await waitFor(() => container.querySelector('[role="alert"]') !== null);
    expect(container.textContent).toContain("1–20");
    expect(container.querySelector('[role="alert"] button')).not.toBeNull();
    await click('[role="alert"] button');
    expect(requests[2]!.url).toBe("/api/admin/audit-events?page=2&pageSize=20&action=member.login");
    requests[2]!.pending.resolve(response("audit", 2, 20, 21));
    await waitFor(() => container.textContent?.includes("21–21") === true);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("resets audit page for size/filter changes and restores query and data on back/forward", async () => {
    browser.history.replaceState({}, "", "/admin/audit?action=member.login&page=2");
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input); urls.push(url);
      const params = new URL(url, "https://app.test").searchParams;
      return response("audit", Number(params.get("page")), Number(params.get("pageSize")) as 20 | 50, 51);
    });
    await act(async () => root.render(<AdminAuditRoute locale={locale()} search={browser.location.search} />));
    await waitFor(() => container.textContent?.includes("21–40") === true);
    await changeSelect('select[aria-label="Rows per page"]', "50");
    await waitFor(() => container.textContent?.includes("1–50") === true);
    expect(urls.at(-1)).toBe("/api/admin/audit-events?page=1&pageSize=50&action=member.login");
    await click('button[aria-label="Page 2"]');
    await waitFor(() => container.textContent?.includes("51–51") === true);
    await changeSelect('select[aria-label="Audit action"]', "task.created");
    await waitFor(() => container.textContent?.includes("1–50") === true);
    expect(urls.at(-1)).toBe("/api/admin/audit-events?page=1&pageSize=50&action=task.created");
    await act(async () => browser.history.back());
    await waitFor(() => container.textContent?.includes("51–51") === true);
    expect((container.querySelector('select[aria-label="Audit action"]') as HTMLSelectElement).value).toBe("member.login");
    await act(async () => browser.history.forward());
    await waitFor(() => container.textContent?.includes("1–50") === true);
    expect((container.querySelector('select[aria-label="Audit action"]') as HTMLSelectElement).value).toBe("task.created");
    await changeSelect('select[aria-label="Audit action"]', "");
    await waitFor(() => urls.at(-1) === "/api/admin/audit-events?page=1&pageSize=50");
    expect(new URLSearchParams(browser.location.search).has("action")).toBe(false);
  });

  it.each(["success", "error"] as const)("ignores a late audit %s after a newer page has loaded", async (outcome) => {
    browser.history.replaceState({}, "", "/admin/audit");
    const requests = auditRequests();
    await act(async () => root.render(<AdminAuditRoute locale={locale()} search="" />));
    await act(async () => {
      browser.history.pushState({}, "", "/admin/audit?page=2");
      browser.dispatchEvent(new browser.PopStateEvent("popstate"));
    });
    expect(requests[0]!.signal?.aborted).toBe(true);
    requests[1]!.pending.resolve(response("audit", 2, 20, 21));
    await waitFor(() => container.textContent?.includes("21–21") === true);
    if (outcome === "success") requests[0]!.pending.resolve(response("audit", 1, 20, 21));
    else requests[0]!.pending.reject(new Error("late error"));
    await act(async () => { await requests[0]!.pending.promise.catch(() => undefined); await new Promise((resolve) => setTimeout(resolve, 5)); });
    expect(container.textContent).toContain("21–21");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("aborts an audit request on unmount and permits a fresh mount", async () => {
    const requests = auditRequests();
    const runtime = locale();
    await act(async () => root.render(<AdminAuditRoute locale={runtime} search="" />));
    await act(async () => root.render(null));
    expect(requests[0]!.signal?.aborted).toBe(true);
    await act(async () => root.render(<AdminAuditRoute locale={runtime} search="" />));
    requests[1]!.pending.resolve(response("audit", 1, 20, 0));
    await waitFor(() => container.querySelector('[data-page-state="empty"]') !== null);
    requests[0]!.pending.resolve(response("audit", 1, 20, 21));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    expect(container.querySelector('[data-page-state="empty"]')).not.toBeNull();
    expect(container.textContent).toContain("0–0");
  });

  it("ignores the old audit error arriving between URL navigation and effect cleanup", async () => {
    browser.history.replaceState({}, "", "/admin/audit");
    const requests = auditRequests();
    await act(async () => root.render(<AdminAuditRoute locale={locale()} search="" />));
    await act(async () => {
      browser.history.pushState({}, "", "/admin/audit?page=2");
      browser.dispatchEvent(new browser.PopStateEvent("popstate"));
      requests[0]!.pending.reject(new Error("old query failed"));
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(requests).toHaveLength(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    requests[1]!.pending.resolve(response("audit", 2, 20, 21));
    await waitFor(() => container.textContent?.includes("21–21") === true);
  });

  it("does not let a delayed mutation refresh overwrite a newer filter result", async () => {
    const requests: Array<{ input: LoadAdminMembersInput; pending: ReturnType<typeof deferred<AdminMembersPage>> }> = [];
    const load = (input: LoadAdminMembersInput) => { const pending = deferred<AdminMembersPage>(); requests.push({ input, pending }); return pending.promise; };
    await act(async () => root.render(<AdminMembersRoute locale={locale()} search="?status=disabled" load={load} update={async () => member("m1", "active")} />));
    requests[0]!.pending.resolve(memberPage(1, 20, 1, [member("m1", "disabled")])); await flush();
    await confirmMemberChange('button'); await flush();
    expect(requests).toHaveLength(2);
    await changeSelect('select[aria-label="Member status"]', "active");
    expect(requests).toHaveLength(3);
    requests[2]!.pending.resolve(memberPage(1, 20, 1, [member("latest", "active")])); await flush();
    requests[1]!.pending.resolve(memberPage(1, 20, 1, [member("stale", "active")])); await flush();
    expect(container.textContent).toContain("latest@example.test");
    expect(container.textContent).not.toContain("stale@example.test");
  });

  it("backs up exactly one page and retries once when the filtered page becomes empty", async () => {
    browser.history.replaceState({}, "", "/admin/members?status=disabled");
    browser.history.pushState({}, "", "/admin/members?status=disabled&page=2");
    const pushState = vi.spyOn(browser.history, "pushState");
    const replaceState = vi.spyOn(browser.history, "replaceState");
    const inputs: LoadAdminMembersInput[] = [];
    const load = async (input: LoadAdminMembersInput) => { inputs.push(input); if (inputs.length === 1) return memberPage(2, 20, 21, [member("last", "disabled")]); if (inputs.length === 2) return memberPage(2, 20, 20, []); return memberPage(1, 20, 20, Array.from({ length: 20 }, (_, index) => member(`m${index}`, "disabled"))); };
    await act(async () => root.render(<AdminMembersRoute locale={locale()} search={browser.location.search} load={load} update={async () => member("last", "active")} />)); await flush();
    await confirmMemberChange('button'); await flush();
    expect(inputs.map(({ page }) => page)).toEqual([2, 2, 1]);
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(pushState).not.toHaveBeenCalled();
    expect(browser.location.search).not.toContain("page=2");
    await act(async () => browser.history.back()); await flush();
    expect(browser.location.search).not.toContain("page=2");
  });

  it("backs up once and retries once when mutation leaves a total-zero page", async () => {
    browser.history.replaceState({}, "", "/admin/members?status=disabled&page=2");
    const inputs: LoadAdminMembersInput[] = [];
    const load = async (input: LoadAdminMembersInput) => { inputs.push(input); if (inputs.length === 1) return memberPage(2, 20, 21, [member("last", "disabled")]); return memberPage(input.page, 20, 0, []); };
    await act(async () => root.render(<AdminMembersRoute locale={locale()} search={browser.location.search} load={load} update={async () => member("last", "active")} />)); await flush();
    await confirmMemberChange('button'); await flush();
    expect(inputs.map(({ page }) => page)).toEqual([2, 2, 1]);
    expect(browser.location.search).not.toContain("page=2");
  });

  it("keeps member data and shows a local error when mutation refresh fails", async () => {
    let calls = 0;
    const load = async (input: LoadAdminMembersInput) => { calls += 1; if (calls === 1) return memberPage(input.page, input.pageSize, 1, [member("m1", "disabled")]); throw new Error("refresh failed"); };
    await act(async () => root.render(<AdminMembersRoute locale={locale()} search="?status=disabled" load={load} update={async () => member("m1", "active")} />)); await flush();
    await confirmMemberChange('button'); await flush();
    expect(container.textContent).toContain("m1@example.test");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable to load");
  });

  it("does not PATCH until confirmed and discards a canceled intent", async () => {
    const requests = memberRequests(); await renderMember(requests);
    await click('button[aria-label="Enable m1@example.test"]');
    expect(requests.map(request => request.method)).toEqual(["GET"]);
    await click('[data-cancel-action]'); expect(requests).toHaveLength(1);
    await confirmMemberChange('button[aria-label="Enable m1@example.test"]');
    expect(requests.map(request => request.method)).toEqual(["GET", "PATCH"]);
    requests[1]!.pending.resolve(Response.json({ member: member("m1", "active") }));
    await waitFor(() => requests.length === 3);
    requests[2]!.pending.resolve(Response.json(memberPage(1, 20, 1, [member("m1", "active")])));
    await waitFor(() => container.querySelector('button[aria-label="Disable m1@example.test"]') !== null);
    expect(requests.map(request => request.method)).toEqual(["GET", "PATCH", "GET"]);
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("drops unconfirmed member actions when query navigation invalidates the list", async () => {
    const requests = memberRequests(); await renderMember(requests);
    await click('button[aria-label="Enable m1@example.test"]');
    const oldConfirm = container.querySelector('[data-confirm-action]') as HTMLButtonElement;
    expect(oldConfirm).not.toBeNull();
    await locationChange("?status=active");
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    await act(async () => oldConfirm.click());
    expect(requests.map(request => request.method)).toEqual(["GET", "GET"]);
    requests[1]!.pending.resolve(Response.json(memberPage(1, 20, 1, [member("m1", "active")])));
    await waitFor(() => container.querySelector('button[aria-label="Disable m1@example.test"]') !== null);
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("does not carry unconfirmed actions across route unmount and remount", async () => {
    const requests = memberRequests(); await renderMember(requests);
    await click('button[aria-label="Enable m1@example.test"]');
    const oldConfirm = container.querySelector('[data-confirm-action]') as HTMLButtonElement;
    await act(async () => root.render(<div>Signed out</div>));
    await act(async () => oldConfirm.click());
    await act(async () => root.render(<AdminMembersRoute locale={locale()} search="" />));
    requests[1]!.pending.resolve(Response.json(memberPage(1, 20, 1, [member("m1", "disabled")])));
    await waitFor(() => container.querySelector('button[aria-label="Enable m1@example.test"]') !== null);
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(requests.map(request => request.method)).toEqual(["GET", "GET"]);
  });

  // Network-boundary tests deliberately keep the route, API decoder and DOM real.
  it("suppresses member status PATCH double clicks in the same React batch", async () => {
    const requests = memberRequests();
    await renderMember(requests);
    const button = container.querySelector('button[aria-label="Enable m1@example.test"]') as HTMLButtonElement;
    await act(async () => { button.click(); button.click(); });
    expect(requests.map((request) => request.method)).toEqual(["GET"]);
    const confirm = container.querySelector('[data-confirm-action]') as HTMLButtonElement;
    await act(async () => { confirm.click(); confirm.click(); });
    expect(requests.map((request) => request.method)).toEqual(["GET", "PATCH"]);
    expect(requests[1]!.url).toBe("/api/admin/members/m1/status");
    expect(JSON.parse(String(requests[1]!.body))).toEqual({ status: "active" });
    expect(button.disabled).toBe(true);
  });

  it.each(["lost response", "wrong id", "wrong status"])("requires a fresh member read after %s without replaying PATCH", async (outcome) => {
    const requests = memberRequests(); await renderMember(requests);
    await confirmMemberChange('button[aria-label="Enable m1@example.test"]');
    if (outcome === "lost response") requests[1]!.pending.reject(new Error("offline"));
    else requests[1]!.pending.resolve(Response.json({ member: member(outcome === "wrong id" ? "other" : "m1", outcome === "wrong status" ? "disabled" : "active") }));
    await waitFor(() => container.querySelector('[role="alert"]') !== null);
    expect(requests).toHaveLength(2);
    expect((container.querySelector('button[aria-label="Enable m1@example.test"]') as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('[role="alert"] button')).not.toBeNull();
    const retry = container.querySelector('[role="alert"] button') as HTMLButtonElement;
    await act(async () => { retry.click(); retry.click(); });
    expect(requests.map((request) => request.method)).toEqual(["GET", "PATCH", "GET"]);
    requests[2]!.pending.resolve(Response.json(memberPage(1, 20, 1, [member("m1", "active")])));
    await waitFor(() => container.querySelector('button[aria-label="Disable m1@example.test"]') !== null);
    expect((container.querySelector('button[aria-label="Disable m1@example.test"]') as HTMLButtonElement).disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("recovers a failed member post-write read using GET only and replaces an empty filtered page", async () => {
    browser.history.replaceState({}, "", "/admin/members?status=disabled&page=2");
    const requests = memberRequests();
    await renderMember(requests, memberPage(2, 20, 21, [member("m1", "disabled")]));
    await confirmMemberChange('button[aria-label="Enable m1@example.test"]');
    requests[1]!.pending.resolve(Response.json({ member: member("m1", "active") }));
    await waitFor(() => requests.length === 3);
    requests[2]!.pending.reject(new Error("offline"));
    await waitFor(() => container.querySelector('[role="alert"]') !== null);
    expect(container.textContent).toContain("m1@example.test");
    expect((container.querySelector('button[aria-label="Enable m1@example.test"]') as HTMLButtonElement).disabled).toBe(true);
    const replace = vi.spyOn(browser.history, "replaceState");
    expect(container.querySelector('[role="alert"] button')).not.toBeNull();
    await click('[role="alert"] button');
    requests[3]!.pending.resolve(Response.json(memberPage(2, 20, 20, [])));
    await waitFor(() => requests.length === 5);
    expect(requests[4]!.url).toBe("/api/admin/members?page=1&pageSize=20&status=disabled");
    requests[4]!.pending.resolve(response("member", 1, 20, 20));
    await waitFor(() => container.textContent?.includes("1–20") === true);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(requests.map((request) => request.method)).toEqual(["GET", "PATCH", "GET", "GET", "GET"]);
  });

  it.each([401, 403])("clears private member rows after PATCH %s and recovers only with an explicit GET", async (status) => {
    const requests = memberRequests(); await renderMember(requests);
    await confirmMemberChange('button[aria-label="Enable m1@example.test"]');
    requests[1]!.pending.resolve(new Response(null, { status }));
    await waitFor(() => container.querySelector('[data-page-state="forbidden"]') !== null);
    expect(container.textContent).not.toContain("m1@example.test");
    expect(container.querySelector('select[aria-label="Member status"]')).toBeNull();
    await click('button');
    expect(requests.map((request) => request.method)).toEqual(["GET", "PATCH", "GET"]);
    requests[2]!.pending.resolve(Response.json(memberPage(1, 20, 1, [member("m1", "active")])));
    await waitFor(() => container.querySelector('button[aria-label="Disable m1@example.test"]') !== null);
  });

  it.each([401, 403])("clears member rows when the post-write read returns %s", async (status) => {
    const requests = memberRequests(); await renderMember(requests);
    await confirmMemberChange('button[aria-label="Enable m1@example.test"]');
    requests[1]!.pending.resolve(Response.json({ member: member("m1", "active") }));
    await waitFor(() => requests.length === 3);
    requests[2]!.pending.resolve(new Response(null, { status }));
    await waitFor(() => container.querySelector('[data-page-state="forbidden"]') !== null);
    expect(container.textContent).not.toContain("m1@example.test");
    expect(requests).toHaveLength(3);
  });

  it.each([200, 403])("ignores a late PATCH %s after leaving and returning to the same member query", async (status) => {
    const requests = memberRequests(); await renderMember(requests);
    await confirmMemberChange('button[aria-label="Enable m1@example.test"]');
    await locationChange("?status=active");
    requests[2]!.pending.resolve(Response.json(memberPage(1, 20, 1, [member("m2", "active")])));
    await waitFor(() => container.textContent?.includes("m2@example.test") === true);
    await locationChange("");
    requests[3]!.pending.resolve(Response.json(memberPage(1, 20, 1, [member("m1", "active")])));
    await waitFor(() => container.querySelector('button[aria-label="Disable m1@example.test"]') !== null);
    requests[1]!.pending.resolve(status === 200 ? Response.json({ member: member("m1", "active") }) : new Response(null, { status }));
    await waitFor(() => container.querySelector('[role="alert"] button') !== null);
    expect(requests).toHaveLength(4);
    expect(container.querySelector('[data-page-state="forbidden"]')).toBeNull();
    // The newer GET began before the old PATCH settled: it cannot release its read lock.
    expect((container.querySelector('button[aria-label="Disable m1@example.test"]') as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('[role="alert"] button')).not.toBeNull();
  });

  it("never leaves old member actions available after navigation read failure", async () => {
    const requests = memberRequests(); await renderMember(requests);
    await locationChange("?status=active");
    requests[1]!.pending.reject(new Error("offline"));
    await waitFor(() => container.querySelector('[role="alert"]') !== null);
    expect(container.textContent).not.toContain("m1@example.test");
    expect(container.querySelector('button[aria-label="Enable m1@example.test"]')).toBeNull();
    await click('[role="alert"] button');
    expect(requests[2]!.url).toBe("/api/admin/members?page=1&pageSize=20&status=active");
  });

  it("does not offer contributor status mutations for administrators or unknown member states", async () => {
    const requests = memberRequests();
    await renderMember(requests, memberPage(1, 20, 3, [
      { ...member("admin", "active"), role: "admin" },
      { ...member("unknown", "active"), status: "unknown" },
      { ...member("unscoped", "active"), role: undefined },
    ]));
    expect(container.textContent).toContain("admin@example.test");
    expect(container.querySelector('button[aria-label^="Disable "]')).toBeNull();
    expect(container.querySelector('button[aria-label^="Enable "]')).toBeNull();
  });

  it("does not release a member lock from a GET that started before an old PATCH settled", async () => {
    const requests = memberRequests(); await renderMember(requests);
    await confirmMemberChange('button[aria-label="Enable m1@example.test"]');
    await locationChange("?status=disabled");
    requests[1]!.pending.resolve(Response.json({ member: member("m1", "active") }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    requests[2]!.pending.resolve(Response.json(memberPage(1, 20, 1, [member("m1", "disabled")])));
    await waitFor(() => container.querySelector('button[aria-label="Enable m1@example.test"]') !== null);
    expect((container.querySelector('button[aria-label="Enable m1@example.test"]') as HTMLButtonElement).disabled).toBe(true);
    await click('[role="alert"] button');
    requests[3]!.pending.resolve(Response.json(memberPage(1, 20, 1, [member("m1", "disabled")])));
    await waitFor(() => container.querySelector('[role="alert"]') === null);
    expect((container.querySelector('button[aria-label="Enable m1@example.test"]') as HTMLButtonElement).disabled).toBe(false);
    expect(requests.map((request) => request.method)).toEqual(["GET", "PATCH", "GET", "GET"]);
  });

  it("a denied concurrent member PATCH invalidates an already running read and hides every row", async () => {
    const requests = memberRequests();
    await renderMember(requests, memberPage(1, 20, 2, [member("m1", "disabled"), member("m2", "disabled")]));
    await confirmMemberChange('button[aria-label="Enable m1@example.test"]');
    await confirmMemberChange('button[aria-label="Enable m2@example.test"]');
    requests[1]!.pending.resolve(Response.json({ member: member("m1", "active") }));
    await waitFor(() => requests.length === 4);
    requests[2]!.pending.resolve(new Response(null, { status: 403 }));
    await waitFor(() => container.querySelector('[data-page-state="forbidden"]') !== null);
    expect(requests[3]!.signal?.aborted).toBe(true);
    requests[3]!.pending.resolve(Response.json(memberPage(1, 20, 2, [member("m1", "active"), member("m2", "active")])));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(container.querySelector('[data-page-state="forbidden"]')).not.toBeNull();
    expect(container.textContent).not.toContain("@example.test");
    expect(requests).toHaveLength(4);
  });

  it("does not treat absence from a filtered member page as proof that an uncertain PATCH succeeded", async () => {
    const requests = memberRequests(); await renderMember(requests);
    await confirmMemberChange('button[aria-label="Enable m1@example.test"]');
    requests[1]!.pending.reject(new Error("offline"));
    await waitFor(() => container.querySelector('[role="alert"] button') !== null);
    await click('[role="alert"] button');
    requests[2]!.pending.resolve(Response.json(memberPage(1, 20, 0, [])));
    await waitFor(() => container.querySelector('[data-page-state="empty"]') !== null);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("no write will be resent");
    expect(requests.map((request) => request.method)).toEqual(["GET", "PATCH", "GET"]);
  });

  it.each([401, 403])("clears an initially denied member list %s and allows one fresh GET", async (status) => {
    const requests = memberRequests();
    await act(async () => root.render(<AdminMembersRoute locale={locale()} search="" />));
    requests[0]!.pending.resolve(new Response(null, { status }));
    await waitFor(() => container.querySelector('[data-page-state="forbidden"]') !== null);
    const retry = container.querySelector('button') as HTMLButtonElement;
    await act(async () => { retry.click(); retry.click(); });
    expect(requests.map((request) => request.method)).toEqual(["GET", "GET"]);
    requests[1]!.pending.resolve(Response.json(memberPage(1, 20, 1, [member("m1", "disabled")])));
    await waitFor(() => container.querySelector('button[aria-label="Enable m1@example.test"]') !== null);
  });

  it("renders an unknown member status as unavailable rather than active", async () => {
    const requests = memberRequests();
    await renderMember(requests, memberPage(1, 20, 1, [{ ...member("m1", "active"), status: undefined }]));
    expect(container.querySelector('section .space-y-3')?.textContent).toContain("Status unavailable");
    expect(container.querySelector('button[aria-label^="Disable "]')).toBeNull();
  });

  it.each(["page", "size", "filter", "duplicate id"])("rejects a member list with mismatched %s before exposing status actions", async (mismatch) => {
    browser.history.replaceState({}, "", "/admin/members?status=disabled");
    const requests = memberRequests();
    await act(async () => root.render(<AdminMembersRoute locale={locale()} search={browser.location.search} />));
    const data = mismatch === "page" ? memberPage(2, 20, 21, [member("m1", "disabled")])
      : mismatch === "size" ? memberPage(1, 50, 1, [member("m1", "disabled")])
      : mismatch === "filter" ? memberPage(1, 20, 1, [member("m1", "active")])
      : memberPage(1, 20, 2, [member("m1", "disabled"), member("m1", "disabled")]);
    requests[0]!.pending.resolve(Response.json(data));
    await waitFor(() => container.querySelector('[data-page-state="error"]') !== null);
    expect(container.textContent).not.toContain("m1@example.test");
    expect(requests).toHaveLength(1);
  });

  async function renderMember(requests: ReturnType<typeof memberRequests>, data = memberPage(1, 20, 1, [member("m1", "disabled")])) {
    await act(async () => root.render(<AdminMembersRoute locale={locale()} search={browser.location.search} />));
    requests[0]!.pending.resolve(Response.json(data));
    await waitFor(() => container.querySelector('select[aria-label="Member status"]') !== null);
  }
  async function locationChange(search: string) {
    await act(async () => { browser.history.pushState({}, "", `/admin/members${search}`); browser.dispatchEvent(new browser.PopStateEvent("popstate")); });
    await flush();
  }

  async function confirmMemberChange(selector: string) {
    await click(selector); expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    await click('[data-confirm-action]');
  }
  async function click(selector: string) { const element = container.querySelector(selector) as HTMLButtonElement; await act(async () => element.click()); }
  async function changeSelect(selector: string, value: string) { const element = container.querySelector(selector) as HTMLSelectElement; await act(async () => { element.value = value; element.dispatchEvent(new browser.Event("change", { bubbles: true })); }); await flush(); }
});

function response(kind: "member" | "audit", page: number, pageSize: 20 | 50 | 100, total: number): Response { const count = Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)); const items = Array.from({ length: count }, (_, index) => kind === "member" ? { id: `member-${page}-${index}`, email: "member@example.test", role: "contributor", status: "disabled" } : { id: `audit-${page}-${index}`, action: "member.login", actorKind: "system", createdAt: "2026-08-28T00:00:00.000Z" }); return new Response(JSON.stringify({ items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }), { headers: { "content-type": "application/json" } }); }
function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }
async function flush() { await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }); }
function member(id: string, status: "active" | "disabled"): AdminMember { return { id, email: `${id}@example.test`, role: "contributor", status }; }
function memberPage(page: number, pageSize: 20 | 50 | 100, total: number, items: AdminMember[]): AdminMembersPage { return { items, pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) } }; }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function auditRequests() {
  const requests: Array<{ url: string; signal?: AbortSignal; pending: ReturnType<typeof deferred<Response>> }> = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const pending = deferred<Response>();
    requests.push({ url: String(input), signal: init?.signal || undefined, pending });
    return pending.promise;
  });
  return requests;
}
async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    if (predicate()) return;
  }
  expect(predicate(), "audit view did not reach the expected state").toBe(true);
}

function memberRequests() {
  const requests: Array<{ url: string; method: string; body?: BodyInit | null; signal?: AbortSignal; pending: ReturnType<typeof deferred<Response>> }> = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const pending = deferred<Response>();
    requests.push({ url: String(input), method: init?.method || "GET", body: init?.body, signal: init?.signal || undefined, pending });
    return pending.promise;
  });
  return requests;
}
