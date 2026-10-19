// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, type Fetcher } from "../../frontend/lib/api";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import {
  createMyInvitation,
  formatInvitationCode,
  generateAdminInvitations,
  isInvitationCode,
  isInvitationForbidden,
  loadAdminInvitations,
  loadMyInvitations,
  normalizeInvitationCode,
  type AdminInvitation,
  type BoundInvitation,
  type MyInvitation,
  type MyInvitations,
} from "../../frontend/lib/invitations-data";
import { SettingsPage } from "../../frontend/pages/settings-page";
import { InvitationAdminPanel } from "../../frontend/components/admin/invitation-admin-panel";
import { chooseOption } from "./helpers/listbox";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const MY_INVITATION: MyInvitation = {
  code: "ABCDEFGHJKLMNPQR",
  formattedCode: "ABCD-EFGH-JKLM-NPQR",
  status: "unused",
  createdAt: "2026-10-18T10:00:00.000Z",
  usedAt: null,
  bound: false,
  boundEmail: null,
};

const USED_INVITATION: MyInvitation = {
  ...MY_INVITATION,
  status: "used",
  usedAt: "2026-10-18T12:00:00.000Z",
  bound: true,
  boundEmail: "invitee@example.test",
};

const BOUND_INVITATION: BoundInvitation = {
  code: "JKMNPQRSTUVWXY23",
  formattedCode: "JKMN-PQRS-TUVW-XY23",
  kind: "admin",
  createdAt: "2026-10-01T09:00:00.000Z",
  usedAt: "2026-10-01T09:05:00.000Z",
};

const MY_INVITATIONS: MyInvitations = { boundInvitation: BOUND_INVITATION, invitation: MY_INVITATION };

const ADMIN_INVITATION: AdminInvitation = {
  id: "inv-1",
  code: "ABCDEFGHJKLMNPQR",
  formattedCode: "ABCD-EFGH-JKLM-NPQR",
  kind: "admin",
  status: "unused",
  ownerMemberId: null,
  ownerEmail: null,
  boundMemberId: null,
  boundEmail: null,
  createdAt: "2026-10-18T10:00:00.000Z",
  usedAt: null,
};

const MEMBER_INVITATION: AdminInvitation = {
  id: "inv-2",
  code: "JKMNPQRSTUVWXY23",
  formattedCode: "JKMN-PQRS-TUVW-XY23",
  kind: "member",
  status: "used",
  ownerMemberId: "member-owner",
  ownerEmail: "sharer@example.test",
  boundMemberId: "member-bound",
  boundEmail: "bound@example.test",
  createdAt: "2026-10-17T10:00:00.000Z",
  usedAt: "2026-10-18T09:00:00.000Z",
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function errorResponse(code: string, status: number): Response {
  return json({ error: { code, message: code, retryable: false } }, status);
}

function requesterFor(body: unknown, status = 200) {
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  const requester: Fetcher = async (input, init) => {
    calls.push({ path: String(input), method: init?.method ?? "GET", body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    return json(body, status);
  };
  return { calls, requester };
}

describe("invitation code helpers", () => {
  it("normalizes lowercase and grouped input into the canonical 16-character code", () => {
    expect(normalizeInvitationCode("abcd-efgh jklm-npqr")).toBe("ABCDEFGHJKLMNPQR");
    expect(normalizeInvitationCode("ABCD-EFGH-JKLM-NPQR")).toBe("ABCDEFGHJKLMNPQR");
    expect(isInvitationCode("abcd efgh jklm npqr")).toBe(true);
    expect(isInvitationCode("ABCD-EFGH-JKLM-NPQ")).toBe(false);
    // The ambiguous letters I and O are not part of the alphabet.
    expect(isInvitationCode("ABCDEFGHIJKLMNOP")).toBe(false);
    expect(isInvitationCode("ABCD-EFGH-JKLM-NPQ0")).toBe(false);
    expect(formatInvitationCode("ABCDEFGHJKLMNPQR")).toBe("ABCD-EFGH-JKLM-NPQR");
    expect(formatInvitationCode("ABCD-EFGH-JKLM-NPQR")).toBe("ABCD-EFGH-JKLM-NPQR");
    expect(formatInvitationCode("SHORT")).toBe("SHORT");
  });
});

describe("invitation data", () => {
  it("creates the member code through POST /api/invitations/mine and strictly parses both codes", async () => {
    const { calls, requester } = requesterFor(MY_INVITATIONS, 201);
    await expect(createMyInvitation(requester)).resolves.toEqual(MY_INVITATIONS);
    expect(calls[0]!.path).toBe("/api/invitations/mine");
    expect(calls[0]!.method).toBe("POST");

    const invalid = (payload: unknown) => requesterFor(payload).requester;
    await expect(createMyInvitation(invalid({ ...MY_INVITATIONS, extra: 1 }))).rejects.toThrow("INVITATION_RESPONSE_INVALID");
    await expect(createMyInvitation(invalid({ boundInvitation: BOUND_INVITATION, invitation: { ...MY_INVITATION, extra: 1 } }))).rejects.toThrow("INVITATION_RESPONSE_INVALID");
    await expect(createMyInvitation(invalid({ boundInvitation: BOUND_INVITATION, invitation: { ...MY_INVITATION, formattedCode: "WRONG" } }))).rejects.toThrow("INVITATION_RESPONSE_INVALID");
    await expect(createMyInvitation(invalid({ boundInvitation: BOUND_INVITATION, invitation: { ...MY_INVITATION, status: "used", usedAt: null, bound: false } }))).rejects.toThrow("INVITATION_RESPONSE_INVALID");
    await expect(createMyInvitation(invalid({ boundInvitation: BOUND_INVITATION, invitation: { ...MY_INVITATION, boundEmail: "leak@example.test" } }))).rejects.toThrow("INVITATION_RESPONSE_INVALID");
    await expect(createMyInvitation(invalid({ boundInvitation: { ...BOUND_INVITATION, usedAt: null }, invitation: null }))).rejects.toThrow("INVITATION_RESPONSE_INVALID");
    await expect(createMyInvitation(invalid({ boundInvitation: { ...BOUND_INVITATION, code: MY_INVITATION.code }, invitation: MY_INVITATION }))).rejects.toThrow("INVITATION_RESPONSE_INVALID");
  });

  it("reads both codes with GET without creating a code", async () => {
    const { calls, requester } = requesterFor(MY_INVITATIONS);
    await expect(loadMyInvitations(requester)).resolves.toEqual(MY_INVITATIONS);
    expect(calls[0]!.path).toBe("/api/invitations/mine");
    expect(calls[0]!.method).toBe("GET");
  });

  it("loads a numbered admin page with status and kind filters", async () => {
    const { calls, requester } = requesterFor({
      items: [ADMIN_INVITATION],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    const page = await loadAdminInvitations({ page: 1, pageSize: 20, status: "unused", kind: "admin", requester });
    expect(calls[0]!.path).toBe("/api/admin/invitations?page=1&pageSize=20&status=unused&kind=admin");
    expect(page.items).toEqual([ADMIN_INVITATION]);
    expect(page.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
  });

  it("rejects a page that disagrees with its request or its filters", async () => {
    const mismatchedPage = requesterFor({ items: [ADMIN_INVITATION], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } }).requester;
    await expect(loadAdminInvitations({ page: 1, pageSize: 20, requester: mismatchedPage })).rejects.toThrow("ADMIN_INVITATION_RESPONSE_INVALID");

    const mismatchedStatus = requesterFor({ items: [MEMBER_INVITATION], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }).requester;
    await expect(loadAdminInvitations({ page: 1, pageSize: 20, status: "unused", requester: mismatchedStatus })).rejects.toThrow("ADMIN_INVITATION_RESPONSE_INVALID");

    const malformedRow = requesterFor({ items: [{ ...ADMIN_INVITATION, kind: "owner" }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }).requester;
    // The numbered-page guard rejects a malformed row before the caller sees it.
    await expect(loadAdminInvitations({ page: 1, pageSize: 20, requester: malformedRow })).rejects.toThrow("NUMBERED_PAGE_RESPONSE_INVALID");
  });

  it("generates unlimited single-use admin codes one at a time", async () => {
    const { calls, requester } = requesterFor({ invitations: [ADMIN_INVITATION] }, 201);
    await expect(generateAdminInvitations(1, requester)).resolves.toEqual([ADMIN_INVITATION]);
    expect(calls[0]!.path).toBe("/api/admin/invitations");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.body).toEqual({ count: 1 });

    await expect(generateAdminInvitations(0, requester)).rejects.toThrow("INVITATION_REQUEST_INVALID");
    await expect(generateAdminInvitations(21, requester)).rejects.toThrow("INVITATION_REQUEST_INVALID");
    await expect(generateAdminInvitations(1, requesterFor({ invitations: [] }, 201).requester)).rejects.toThrow("ADMIN_INVITATION_RESPONSE_INVALID");
    await expect(generateAdminInvitations(1, requesterFor({ invitations: [{ ...ADMIN_INVITATION, kind: "member", ownerMemberId: "member-owner" }] }, 201).requester)).rejects.toThrow("ADMIN_INVITATION_RESPONSE_INVALID");
  });

  it("classifies a capability refusal as forbidden", () => {
    expect(isInvitationForbidden(new ApiRequestError("FORBIDDEN", "", 403, false))).toBe(true);
    expect(isInvitationForbidden(new ApiRequestError("INTERNAL", "", 500, true))).toBe(false);
    expect(isInvitationForbidden(new Error("network"))).toBe(false);
  });
});

describe("settings invitation cards", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });

  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/settings" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  async function settle(work?: () => void) {
    await act(async () => {
      work?.();
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 0);
      await promise;
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
  }

  async function mount(options: { loadInvitations?: () => Promise<MyInvitations>; createInvitation?: () => Promise<MyInvitations> } = {}) {
    const loadInvitations = options.loadInvitations ?? vi.fn().mockResolvedValue(MY_INVITATIONS);
    const createInvitation = options.createInvitation ?? vi.fn().mockResolvedValue(MY_INVITATIONS);
    await act(async () => root.render(<SettingsPage locale={locale} email="member@example.test" role="contributor" loadInvitations={loadInvitations} createInvitation={createInvitation} />));
    await settle();
    return { loadInvitations, createInvitation };
  }

  function button(selector: string): HTMLButtonElement {
    const element = container.querySelector(selector);
    expect(element, selector).toBeTruthy();
    return element as HTMLButtonElement;
  }

  it("shows the code bound to this account and the member's own share code with GET", async () => {
    const written: string[] = [];
    Object.defineProperty(browser.navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async (value: string) => { written.push(value); }) } });
    const { loadInvitations, createInvitation } = await mount();

    expect(loadInvitations).toHaveBeenCalledTimes(1);
    expect(createInvitation).not.toHaveBeenCalled();
    // The code that created this account is visible (also the reset proof).
    expect(container.querySelector("[data-settings-bound-invitation]")?.getAttribute("data-settings-bound-invitation")).toBe("ready");
    expect(container.querySelector("[data-settings-bound-invitation-code]")?.textContent).toBe(BOUND_INVITATION.formattedCode);
    // The member's own sharing code stays separate and copyable while unused.
    expect(container.querySelector("[data-settings-invitation]")?.getAttribute("data-settings-invitation")).toBe("ready");
    expect(container.querySelector("[data-settings-invitation-code]")?.textContent).toBe(MY_INVITATION.formattedCode);
    expect(container.querySelector("[data-settings-invitation-status]")?.textContent).toBe("Available");

    await act(async () => button("[data-settings-invitation-copy]").click());
    await settle();
    expect(written).toEqual([MY_INVITATION.formattedCode]);
  });

  it("offers explicit creation only when no sharing code exists, and POSTs on click", async () => {
    const createInvitation = vi.fn().mockResolvedValue(MY_INVITATIONS);
    await mount({ loadInvitations: vi.fn().mockResolvedValue({ boundInvitation: BOUND_INVITATION, invitation: null }), createInvitation });
    expect(container.querySelector("[data-settings-invitation-empty]")).not.toBeNull();
    expect(container.querySelector("[data-settings-invitation-code]")).toBeNull();
    await act(async () => button("[data-settings-invitation-create]").click());
    await settle();
    expect(createInvitation).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-settings-invitation-code]")?.textContent).toBe(MY_INVITATION.formattedCode);
  });

  it("reports a clipboard failure visibly", async () => {
    Object.defineProperty(browser.navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
    await mount();
    await act(async () => button("[data-settings-invitation-copy]").click());
    await settle();
    expect(container.querySelector('[data-settings-invitation-copy-status="failed"]')?.textContent).toContain("could not be copied");
  });

  it("shows the new member's email once the sharing code is used, read-only", async () => {
    await mount({ loadInvitations: vi.fn().mockResolvedValue({ boundInvitation: BOUND_INVITATION, invitation: USED_INVITATION }) });
    expect(container.querySelector("[data-settings-invitation-status]")?.textContent).toBe("Used");
    expect(container.querySelector("[data-settings-invitation-used-note]")?.textContent).toContain("one invitation code for life");
    expect(container.querySelector("[data-settings-invitation-bound-email]")?.textContent).toContain("invitee@example.test");
    expect(container.querySelector("[data-settings-invitation-copy]")).toBeNull();
  });

  it("says so when the account has no bound invitation code", async () => {
    await mount({ loadInvitations: vi.fn().mockResolvedValue({ boundInvitation: null, invitation: MY_INVITATION }) });
    expect(container.querySelector("[data-settings-bound-invitation]")?.getAttribute("data-settings-bound-invitation")).toBe("empty");
    expect(container.querySelector("[data-settings-bound-invitation-empty]")?.textContent).toContain("no bound invitation code");
  });

  it("shows a recoverable failure and re-reads on retry", async () => {
    const loadInvitations = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(MY_INVITATIONS);
    await mount({ loadInvitations });
    await settle();
    expect(container.querySelector("[data-settings-invitation]")?.getAttribute("data-settings-invitation")).toBe("error");
    expect(container.querySelector("[data-settings-invitation-error]")?.getAttribute("role")).toBe("alert");
    await act(async () => button("[data-settings-invitation-retry]").click());
    await settle();
    expect(container.querySelector("[data-settings-invitation-code]")?.textContent).toBe(MY_INVITATION.formattedCode);
    expect(container.querySelector("[data-settings-bound-invitation-code]")?.textContent).toBe(BOUND_INVITATION.formattedCode);
  });
});

describe("admin invitation panel", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });

  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/menus" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  async function settle(work?: () => void) {
    await act(async () => {
      work?.();
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 0);
      await promise;
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
  }

  function pageOf(items: readonly AdminInvitation[], page = 1, pageSize = 20) {
    const total = items.length;
    return { items, pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) } };
  }

  async function mount(requester: Fetcher) {
    await act(async () => root.render(<InvitationAdminPanel locale={locale} requester={requester} />));
    await settle();
  }

  /** The combobox trigger carries its name in the `.sr-only` span, not aria-label. */
  function filterTrigger(name: string): Element {
    const trigger = [...container.querySelectorAll('[aria-haspopup="listbox"]')].find((element) => element.querySelector(".sr-only")?.textContent === name);
    expect(trigger, name).toBeTruthy();
    return trigger!;
  }

  function button(selector: string): HTMLButtonElement {
    const element = container.querySelector(selector);
    expect(element, selector).toBeTruthy();
    return element as HTMLButtonElement;
  }

  it("renders the numbered list with owners, bound members and statuses, then generates a code", async () => {
    let list: AdminInvitation[] = [ADMIN_INVITATION, MEMBER_INVITATION];
    const calls: Array<{ path: string; method: string; body: unknown }> = [];
    const created: AdminInvitation = { ...ADMIN_INVITATION, id: "inv-3", code: "NPQRSTUVWXYZ2345", formattedCode: "NPQR-STUV-WXYZ-2345" };
    const requester: Fetcher = async (input, init) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      calls.push({ path, method, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
      if (method === "POST") {
        list = [created, ...list];
        return json({ invitations: [created] }, 201);
      }
      return json(pageOf(list));
    };
    await mount(requester);

    expect(container.querySelector("[data-admin-invitations]")?.getAttribute("data-admin-invitations")).toBe("ready");
    expect(container.textContent).toContain("Invitation codes");
    expect(container.textContent).toContain(ADMIN_INVITATION.formattedCode);
    expect(container.textContent).toContain(MEMBER_INVITATION.formattedCode);
    expect(container.textContent).toContain("sharer@example.test");
    expect(container.textContent).toContain("bound@example.test");
    expect(container.textContent).toContain("Admin");
    expect(container.textContent).toContain("Member");
    expect(container.textContent).toContain("Unused");
    expect(container.textContent).toContain("Used");

    await act(async () => button("[data-admin-invitations-generate]").click());
    await settle();
    // Generation re-reads page 1 through the effect, so one extra settle lets the
    // authoritative list replace the loading surface.
    await settle();
    const posts = calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.path).toBe("/api/admin/invitations");
    expect(posts[0]!.body).toEqual({ count: 1 });
    expect(container.querySelector("[data-admin-invitations-generated]")?.textContent).toContain(created.formattedCode);
    const codes = [...container.querySelectorAll("[data-admin-invitation-code]")].map((node) => node.textContent);
    expect(codes).toContain(created.formattedCode);
    expect(codes).toHaveLength(3);
  });

  it("shows forbidden instead of an empty table when the capability is missing", async () => {
    await mount(async () => errorResponse("FORBIDDEN", 403));
    expect(container.querySelector("[data-admin-invitations]")?.getAttribute("data-admin-invitations")).toBe("forbidden");
    expect(container.querySelector('[data-page-state="forbidden"]')).toBeTruthy();
    expect(container.textContent).toContain("do not have permission");
    expect(container.querySelector("[data-admin-invitation]")).toBeNull();
  });

  it("filters through the shared pickers and applied-filter chips", async () => {
    const calls: string[] = [];
    const requester: Fetcher = async (input) => {
      const path = String(input);
      calls.push(path);
      const url = new URL(path, "https://app.test");
      const status = url.searchParams.get("status");
      const kind = url.searchParams.get("kind");
      const items = [ADMIN_INVITATION, MEMBER_INVITATION].filter((item) => (!status || item.status === status) && (!kind || item.kind === kind));
      return json(pageOf(items));
    };
    await mount(requester);
    expect(calls[0]).toContain("/api/admin/invitations?");

    await chooseOption(filterTrigger("Invitation status"), "Unused");
    await settle();
    expect(calls.at(-1)).toContain("status=unused");
    expect(container.querySelector("[data-applied-filters]")?.textContent).toContain("Status: Unused");
    expect(container.querySelector("[data-admin-invitation-code]")?.textContent).toBe(ADMIN_INVITATION.formattedCode);

    await chooseOption(filterTrigger("Invitation type"), "Member");
    await settle();
    expect(calls.at(-1)).toContain("kind=member");
    expect(container.querySelector("[data-applied-filters]")?.textContent).toContain("Type: Member");

    await act(async () => button("[data-filters-clear]").click());
    await settle();
    expect(calls.at(-1)).not.toContain("status=");
    expect(calls.at(-1)).not.toContain("kind=");
  });
});
