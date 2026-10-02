// @vitest-environment node
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp, waitForApp, forceRemountAppAt, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));
describe("inbox stable capture through App", () => {
  let app: MountedApp | undefined;
  let bodies: Record<string, unknown>[]; let reads: number; let readFailure = false;
  let respond: (body: Record<string, unknown>) => Response | Promise<Response>;
  const entity = (body: Record<string, unknown>) => ({ ...body, status: "inbox", promotedTaskId: null, promotedSubmissionId: null, createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z" });
  const receipt = (body: Record<string, unknown>) => Response.json({ item: entity(body), created: true });
  const main = () => app!.container.querySelector("main")!;
  const content = () => main().querySelector("textarea") as HTMLTextAreaElement;
  const button = (selector: string) => main().querySelector(selector) as HTMLButtonElement;
  const create = () => [...main().querySelectorAll("button")].find(node => node.textContent === "Add to inbox")!;
  async function change(value: string) {
    await act(async () => {
      const node = content(); node.value = value;
      const key = Object.keys(node).find(key => key.startsWith("__reactProps$"))!;
      (node as unknown as Record<string, { onChange: (event: { currentTarget: HTMLTextAreaElement }) => void }>)[key]!.onChange({ currentTarget: node });
    });
  }
  async function click(node: HTMLButtonElement) { expect(node).toBeTruthy(); await act(async () => { node.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
  async function forceRemount(path: string) { await forceRemountAppAt(app!, path); }
  async function mount(memberId = "contributor-route-auditor", saved?: Record<string, string>) {
    bodies = []; reads = 0; readFailure = false; respond = receipt;
    app = await mountApp({ url: "https://app.test/inbox", configureBrowser: browser => { for (const [key, value] of Object.entries(saved ?? {})) browser.sessionStorage.setItem(key, value); }, fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      if (url.pathname === "/api/session") return Response.json({ member: { id: memberId, email: "contributor@app.test", role: "contributor" }, capabilities: ["knowledge:read", "submission:create", "submission:read-own"], permissionMask: "0x100000", logoutUrl: "/auth/logout" });
      if (url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x100000") });
      if (url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (url.pathname === "/api/notifications/summary") return Response.json({ unread: 0 });
      expect(url.pathname).toMatch(/^\/api\/inbox(?:\/|$)/);
      if (init?.method === "POST") { const body = JSON.parse(String(init.body)); bodies.push(body); return respond(body); }
      reads++;
      if (readFailure) return apiError(503, "UNAVAILABLE", true);
      if (url.pathname !== "/api/inbox") return Response.json(entity(bodies.at(-1)!));
      return Response.json({ items: [], pagination: { page: Number(url.searchParams.get("page") ?? 1), pageSize: Number(url.searchParams.get("pageSize") ?? 20), total: 0, totalPages: 0 } });
    } });
    await waitForApp(() => !!content());
  }
  afterEach(async () => { await app?.unmount(); app = undefined; });
  it("retains the original frozen request on uncertainty and retries exactly once", async () => {
    await mount(); respond = () => apiError(503, "UNAVAILABLE", true);
    await change("Original private note"); await click(create());
    expect(content().value).toBe("Original private note"); expect(content().disabled).toBe(true);
    expect(button("[data-create-retry]")).toBeTruthy(); const original = bodies[0];
    respond = receipt; await click(button("[data-create-retry]"));
    await waitForApp(() => content().value === ""); expect(bodies).toEqual([original, original]);
  });
  it("double click issues one POST and confirmed creation clears only after readback", async () => {
    await mount(); let resolve!: (response: Response) => void;
    respond = () => new Promise(done => { resolve = done; });
    await change("One intent"); const capture = create(); await act(async () => { capture.click(); capture.click(); });
    expect(bodies).toHaveLength(1); expect(content().value).toBe("One intent");
    await act(async () => resolve(receipt(bodies[0]!))); await waitForApp(() => content().value === "");
    expect(reads).toBe(3);
  });
  it("known rejection preserves editable draft, rather than losing content", async () => {
    await mount(); respond = () => apiError(400, "INBOX_INVALID", false);
    await change("Keep this draft"); await click(create());
    expect(content().value).toBe("Keep this draft"); expect(content().disabled).toBe(false);
    expect(button("[data-create-retry]")).toBeNull();
  });
  it.each(["id", "clientKey", "content", "created"])("mismatched %s receipt remains unknown", async field => {
    await mount(); respond = body => Response.json(field === "created" ? { item: entity(body), created: "yes" } : { item: { ...entity(body), [field]: "mismatch" }, created: true });
    await change("Receipt protected"); await click(create());
    expect(button("[data-create-retry]")).toBeTruthy(); expect(content().value).toBe("Receipt protected");
    expect(reads).toBe(1);
  });
  it("acknowledged creation retries reads only after failed readback and route re-entry", async () => {
    await mount(); readFailure = true;
    await change("Acknowledged note"); await click(create());
    expect(button("[data-create-read-retry]")).toBeTruthy(); expect(button("[data-create-retry]")).toBeNull();
    readFailure = false; await forceRemount("/unknown"); await forceRemount("/inbox"); await waitForApp(() => !!content());
    expect(content().value).toBe("Acknowledged note"); expect(button("[data-create-read-retry]")).toBeTruthy();
    await click(button("[data-create-read-retry]")); await waitForApp(() => content().value === ""); expect(bodies).toHaveLength(1);
  });
  it("unknown creation survives leaving and never automatically replays", async () => {
    await mount(); respond = () => { throw new TypeError("lost transport"); };
    await change("Surviving intent"); await click(create()); const original = bodies[0];
    await forceRemount("/unknown"); await forceRemount("/inbox"); await waitForApp(() => !!content());
    expect(content().value).toBe("Surviving intent"); expect(bodies).toHaveLength(1);
    respond = receipt; await click(button("[data-create-retry]")); await waitForApp(() => content().value === ""); expect(bodies).toEqual([original, original]);
  });
  it("quota failure prevents any POST and keeps the draft", async () => {
    await mount(); vi.spyOn(app!.browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await change("Do not lose"); await click(create());
    expect(bodies).toEqual([]); expect(content().value).toBe("Do not lose"); expect(button("[data-create-storage-retry]")).toBeTruthy();
  });
  it("late creation after forced teardown does not read or alter the new route", async () => {
    await mount(); let resolve!: (response: Response) => void; respond = () => new Promise(done => { resolve = done; });
    await change("Late intent"); await click(create());
    await act(async () => expect(writeWorkspaceHistory("push", "/unknown")).toBe("blocked"));
    await forceRemount("/unknown");
    const before = reads; await act(async () => resolve(receipt(bodies[0]!))); expect(reads).toBe(before);
    await forceRemount("/inbox"); await waitForApp(() => !!content());
    expect(button("[data-create-retry]")).toBeTruthy(); expect(bodies).toHaveLength(1);
  });
  it("recovers the exact unknown intent in a fresh browser realm, isolated from another member", async () => {
    await mount(); respond = () => apiError(503, "UNAVAILABLE", true);
    await change("Alice secret"); await click(create()); const original = bodies[0]!;
    const key = "memory-garden:inbox-create:v1:contributor-route-auditor";
    const saved = { [key]: app!.browser.sessionStorage.getItem(key)! };
    await app!.unmount(); app = undefined;
    await mount("bob", saved);
    expect(content().value).toBe(""); expect(content().disabled).toBe(false); expect(bodies).toEqual([]);
    expect(main().textContent).not.toContain("Alice secret");
    await app!.unmount(); app = undefined;
    await mount("contributor-route-auditor", saved);
    expect(content().value).toBe("Alice secret"); expect(content().disabled).toBe(true); expect(bodies).toEqual([]);
    await click(button("[data-create-retry]")); expect(bodies).toEqual([original]);
    await waitForApp(() => content().value === "");
  });
  it("never downgrades a confirmed receipt when acknowledgement storage initially fails", async () => {
    await mount();
    const originalSet = app!.browser.sessionStorage.setItem.bind(app!.browser.sessionStorage);
    let fail = true;
    vi.spyOn(app!.browser.sessionStorage, "setItem").mockImplementation((key, value) => {
      if (fail && value.includes('"acknowledged":true')) throw new Error("quota");
      originalSet(key, value);
    });
    await change("Already confirmed"); await click(create());
    expect(button("[data-create-storage-retry]")).toBeTruthy(); expect(bodies).toHaveLength(1);
    await click(button("[data-create-storage-retry]")); expect(button("[data-create-retry]")).toBeNull();
    fail = false; await click(button("[data-create-storage-retry]"));
    expect(button("[data-create-read-retry]")).toBeTruthy();
    await click(button("[data-create-read-retry]")); await waitForApp(() => content().value === ""); expect(bodies).toHaveLength(1);
  });
  it.each([401, 403])("clears private capture and disables the route after %i", async status => {
    await mount(); respond = () => apiError(status, "DENIED", false);
    await change("Private draft"); await click(create());
    expect(content()).toBeNull(); expect(main().textContent).not.toContain("Private draft");
    expect(app!.browser.sessionStorage.getItem("memory-garden:inbox-create:v1:contributor-route-auditor")).toBeNull();
  });
  it("blocks malformed stored intents without sending or overwriting them", async () => {
    const key = "memory-garden:inbox-create:v1:contributor-route-auditor";
    await mount("contributor-route-auditor", { [key]: "corrupted" });
    expect(button("[data-create-storage-retry]")).toBeTruthy();
    await click(button("[data-create-storage-retry]")); expect(bodies).toEqual([]);
    expect(app!.browser.sessionStorage.getItem(key)).toBe("corrupted");
  });

  it("does not adopt a different recovery record over this form's unresolved request", async () => {
    await mount(); respond = () => apiError(503, "UNAVAILABLE", true);
    await change("Original pending capture"); await click(create());
    const key = "memory-garden:inbox-create:v1:contributor-route-auditor";
    const original = app!.browser.sessionStorage.getItem(key)!;
    const changed = JSON.parse(original); changed.intent.id = "other"; changed.intent.content = "Other pending capture";
    app!.browser.sessionStorage.setItem(key, JSON.stringify(changed));
    await click(button("[data-create-retry]")); expect(button("[data-create-storage-retry]")).toBeTruthy();
    await click(button("[data-create-storage-retry]"));
    expect(content().value).toBe("Original pending capture"); expect(button("[data-create-storage-retry]")).toBeTruthy(); expect(bodies).toHaveLength(1);
    app!.browser.sessionStorage.setItem(key, original); await click(button("[data-create-storage-retry]"));
    expect(button("[data-create-retry]")).toBeTruthy();
  });

});
