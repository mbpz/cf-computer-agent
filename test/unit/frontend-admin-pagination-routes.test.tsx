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
  beforeEach(() => { browser = new Window({ url: "https://app.test/admin/members" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
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
    await act(async () => { browser.history.pushState({}, "", "/admin/audit?action=member.login&page=2"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect(browser.location.search).toContain("action=member.login"); expect(browser.location.search).toContain("page=2");
  });

  it("does not let a delayed mutation refresh overwrite a newer filter result", async () => {
    const requests: Array<{ input: LoadAdminMembersInput; pending: ReturnType<typeof deferred<AdminMembersPage>> }> = [];
    const load = (input: LoadAdminMembersInput) => { const pending = deferred<AdminMembersPage>(); requests.push({ input, pending }); return pending.promise; };
    await act(async () => root.render(<AdminMembersRoute locale={locale()} search="?status=disabled" load={load} update={async () => member("m1", "active")} />));
    requests[0]!.pending.resolve(memberPage(1, 20, 1, [member("m1", "disabled")])); await flush();
    await click('button'); await flush();
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
    await click('button'); await flush();
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
    await click('button'); await flush();
    expect(inputs.map(({ page }) => page)).toEqual([2, 2, 1]);
    expect(browser.location.search).not.toContain("page=2");
  });

  it("keeps member data and shows a local error when mutation refresh fails", async () => {
    let calls = 0;
    const load = async (input: LoadAdminMembersInput) => { calls += 1; if (calls === 1) return memberPage(input.page, input.pageSize, 1, [member("m1", "disabled")]); throw new Error("refresh failed"); };
    await act(async () => root.render(<AdminMembersRoute locale={locale()} search="?status=disabled" load={load} update={async () => member("m1", "active")} />)); await flush();
    await click('button'); await flush();
    expect(container.textContent).toContain("m1@example.test");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable to load");
  });

  async function click(selector: string) { const element = container.querySelector(selector) as HTMLButtonElement; await act(async () => element.click()); }
  async function changeSelect(selector: string, value: string) { const element = container.querySelector(selector) as HTMLSelectElement; await act(async () => { element.value = value; element.dispatchEvent(new browser.Event("change", { bubbles: true })); }); await flush(); }
});

function response(kind: "member" | "audit", page: number, pageSize: 20 | 50 | 100, total: number): Response { const count = Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)); const items = Array.from({ length: count }, (_, index) => kind === "member" ? { id: `member-${page}-${index}`, email: "member@example.test", role: "contributor", status: "disabled" } : { id: `audit-${page}-${index}`, action: "member.login", actorKind: "system", createdAt: "2026-08-28T00:00:00.000Z" }); return new Response(JSON.stringify({ items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }), { headers: { "content-type": "application/json" } }); }
function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }
async function flush() { await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }); }
function member(id: string, status: "active" | "disabled"): AdminMember { return { id, email: `${id}@example.test`, role: "contributor", status }; }
function memberPage(page: number, pageSize: 20 | 50 | 100, total: number, items: AdminMember[]): AdminMembersPage { return { items, pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) } }; }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
