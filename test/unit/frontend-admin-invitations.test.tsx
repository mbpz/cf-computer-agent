// @vitest-environment node
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminMembersRoute } from "../../frontend/app";
import { ApiRequestError } from "../../frontend/lib/api";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { MembersPage } from "../../frontend/pages/admin/members-page";
import type { AdminMember, AdminMembersPage } from "../../frontend/lib/admin-members-data";
import type { AdminMemberInvitation } from "../../frontend/lib/admin-member-invitations-data";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("admin member invitations", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const pending: AdminMemberInvitation = { id: "i1", email: "new@example.test", status: "pending", createdAt: "2026-10-11T00:00:00.000Z", expiresAt: "2026-10-12T00:00:00.000Z" };
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/members" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  function setEmail(value: string) {
    const input = container.querySelector("#invitation-email") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new browser.Event("input", { bubbles: true }));
  }
  function buttonByText(text: string) { return [...container.querySelectorAll("button")].find((item) => item.textContent === text) as HTMLButtonElement | undefined; }
  async function click(element: HTMLElement | undefined) { expect(element, "button").toBeTruthy(); await act(async () => element!.click()); }
  async function openAddDialog() { await click(container.querySelector("[data-member-add-open]") as HTMLButtonElement); }

  it("issues an invitation only after confirmation", async () => {
    const issue = vi.fn();
    await act(async () => root.render(<MembersPage locale={locale} members={[]} onIssueInvitation={issue} />));
    await openAddDialog();
    await act(async () => setEmail("new@example.test"));
    await click(buttonByText("Generate code"));
    expect(issue).not.toHaveBeenCalled();
    expect(container.textContent).toContain("A one-time login code will be created for new@example.test.");
    await click(container.querySelector("[data-confirm-action]") as HTMLButtonElement);
    expect(issue).toHaveBeenCalledWith("new@example.test");
    expect(issue).toHaveBeenCalledTimes(1);
  });

  it("opens the add-member dialog from the add control and closes it on cancel", async () => {
    await act(async () => root.render(<MembersPage locale={locale} members={[]} onIssueInvitation={vi.fn()} />));
    expect(container.querySelector("[data-member-add-dialog]")).toBeNull();
    const trigger = container.querySelector("[data-member-add-open]") as HTMLButtonElement;
    expect(trigger.textContent).toBe("Invite member");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    await click(trigger);
    expect(container.querySelectorAll("[data-member-add-dialog]")).toHaveLength(1);
    expect(container.querySelector("#invitation-email")).toBeTruthy();
    await click(container.querySelector("[data-member-add-cancel]") as HTMLButtonElement);
    expect(container.querySelector("[data-member-add-dialog]")).toBeNull();
  });

  it("submits the dialog email through the same issue call as the inline flow", async () => {
    const issue = vi.fn();
    await act(async () => root.render(<MembersPage locale={locale} members={[]} onIssueInvitation={issue} />));
    await openAddDialog();
    await act(async () => setEmail("dialog@example.test"));
    await click(buttonByText("Generate code"));
    expect(issue).not.toHaveBeenCalled();
    await click(container.querySelector("[data-confirm-action]") as HTMLButtonElement);
    expect(issue).toHaveBeenCalledWith("dialog@example.test");
    expect(issue).toHaveBeenCalledTimes(1);
  });

  it("dismisses the dialog after a code is issued", async () => {
    await act(async () => root.render(<MembersPage locale={locale} members={[]} onIssueInvitation={vi.fn()} />));
    await openAddDialog();
    expect(container.querySelectorAll("[data-member-add-dialog]")).toHaveLength(1);
    await act(async () => root.render(<MembersPage locale={locale} members={[]} onIssueInvitation={vi.fn()} issuedInvitation={{ email: "new@example.test", code: "CODE-ABCD-1234", expiresAt: pending.expiresAt }} />));
    expect(container.querySelector("[data-member-add-dialog]")).toBeNull();
  });

  it("fills the available height for the member list", async () => {
    await act(async () => root.render(<MembersPage locale={locale} members={[]} />));
    const pageRoot = container.querySelector("section") as HTMLElement;
    expect(pageRoot.className).toContain("lg:h-full");
    expect(pageRoot.className).toContain("lg:min-h-0");
    const table = container.querySelector("[data-list-mode]") as HTMLElement;
    expect(table.className).toContain("lg:min-h-0");
    expect(table.className).toContain("lg:flex-1");
  });

  it("shows the code once with copy, expiry, and the one-time notice", async () => {
    await act(async () => root.render(<MembersPage locale={locale} members={[]} onIssueInvitation={vi.fn()} issuedInvitation={{ email: "new@example.test", code: "CODE-ABCD-1234", expiresAt: pending.expiresAt }} />));
    expect(container.querySelectorAll("[data-invitation-code]")).toHaveLength(1);
    expect(container.textContent).toContain("CODE-ABCD-1234");
    expect(container.textContent).toContain("Login code for new@example.test");
    expect(container.textContent).toContain("shown only once");
    expect(container.textContent).toContain(`Expires ${pending.expiresAt}`);
    expect(buttonByText("Copy code")).toBeTruthy();
  });

  it("revokes a pending invitation only after confirmation", async () => {
    const revoke = vi.fn();
    await act(async () => root.render(<MembersPage locale={locale} members={[]} invitations={[pending]} onRevokeInvitation={revoke} />));
    expect(container.textContent).toContain("Pending");
    await click(buttonByText("Revoke"));
    expect(revoke).not.toHaveBeenCalled();
    await click(container.querySelector("[data-confirm-action]") as HTMLButtonElement);
    expect(revoke).toHaveBeenCalledWith("i1");
  });

  it("reconciles an unconfirmed issue from the list instead of resending", async () => {
    let issues = 0; let reads = 0;
    const load = async () => page([member("m1")]);
    const loadInvitations = async () => { reads += 1; return [pending]; };
    const issue = async () => { issues += 1; throw new Error("network"); };
    browser.history.replaceState({}, "", "/admin/members");
    await act(async () => root.render(<AdminMembersRoute locale={locale} search="" load={load} loadInvitations={loadInvitations} issueInvitation={issue} />));
    await flush();
    await openAddDialog();
    await act(async () => setEmail("new@example.test"));
    await click(buttonByText("Generate code"));
    await click(container.querySelector("[data-confirm-action]") as HTMLButtonElement);
    await flush();
    expect(issues).toBe(1);
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toContain("The result for new@example.test could not be confirmed.");
  });

  it("treats a duplicate issue as already pending and reconciles instead of erroring hard", async () => {
    let issues = 0; let reads = 0;
    const load = async () => page([member("m1")]);
    const loadInvitations = async () => { reads += 1; return [pending]; };
    const issue = async () => { issues += 1; throw new ApiRequestError("INVITATION_ALREADY_PENDING", "already pending", 409, false); };
    browser.history.replaceState({}, "", "/admin/members");
    await act(async () => root.render(<AdminMembersRoute locale={locale} search="" load={load} loadInvitations={loadInvitations} issueInvitation={issue} />));
    await flush();
    await openAddDialog();
    await act(async () => setEmail("new@example.test"));
    await click(buttonByText("Generate code"));
    await click(container.querySelector("[data-confirm-action]") as HTMLButtonElement);
    await flush();
    expect(issues).toBe(1);
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toContain("is already pending");
  });
});

function member(id: string): AdminMember { return { id, email: `${id}@example.test`, role: "contributor", status: "active" }; }
function page(items: AdminMember[]): AdminMembersPage { return { items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: items.length ? 1 : 0 } }; }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
