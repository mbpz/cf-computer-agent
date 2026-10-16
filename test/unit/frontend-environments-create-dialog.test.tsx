// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";

vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));

const NOW = "2026-10-16T00:00:00.000Z";
const MEMBER = "contributor-route-auditor";

type Row = Readonly<{ id: string; memberId: string; name: string; type: string; taskId: string | null; version: number; createdAt: string; updatedAt: string }>;

/** React drops a raw `value` assignment, so the shared input is driven through its own handler. */
async function typeInto(node: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    node.value = value;
    const key = Object.keys(node).find(candidate => candidate.startsWith("__reactProps$"))!;
    (node as unknown as Record<string, { onChange: (event: { target: HTMLInputElement; currentTarget: HTMLInputElement }) => void }>)[key]!.onChange({ target: node, currentTarget: node });
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 0);
    await promise;
  });
}

async function click(node: HTMLElement | null): Promise<void> {
  expect(node).not.toBeNull();
  await act(async () => {
    node!.click();
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 0);
    await promise;
  });
}

describe("environment creation dialog", () => {
  let app: MountedApp | undefined;
  let rows: Row[];
  let posts: Record<string, unknown>[];

  afterEach(async () => { await app?.unmount(); app = undefined; });

  async function mount(): Promise<void> {
    rows = []; posts = [];
    app = await mountApp({ url: "https://app.test/environments", configureBrowser: browser => {
      Object.defineProperty(browser, "matchMedia", {
        configurable: true,
        value: (query: string) => ({ matches: query === "(min-width: 1024px)", media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }),
      });
    }, fetch: async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      if (url.pathname === "/api/session") return Response.json({ member: { id: MEMBER, email: "contributor@app.test", role: "contributor" }, capabilities: ["knowledge:read", "submission:create", "submission:read-own"], permissionMask: "0x200000", logoutUrl: "/auth/logout" });
      if (url.pathname === "/api/navigation") return Response.json({ tree: currentNavigationFixture("contributor", "0x200000") });
      if (url.pathname === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (url.pathname === "/api/notifications/summary") return Response.json({ unread: 0 });
      expect(url.pathname).toBe("/api/environments");
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push(body);
        rows = [{ id: "environment-dialog", memberId: MEMBER, name: String(body.name), type: String(body.type), taskId: (body.taskId as string | null) ?? null, version: 1, createdAt: NOW, updatedAt: NOW }];
        return Response.json({ environment: rows[0] }, { status: 201 });
      }
      return Response.json({ items: rows, pagination: { page: 1, pageSize: 20, total: rows.length, totalPages: rows.length ? 1 : 0 } });
    } });
    await waitForApp(() => !!trigger());
  }

  const main = () => app!.container.querySelector("main")!;
  const trigger = () => main().querySelector<HTMLButtonElement>("[data-environment-create-open]");
  const dialog = () => main().querySelector<HTMLElement>("[data-environment-create-dialog]");
  const form = () => main().querySelector<HTMLFormElement>("[data-environment-create]");

  it("keeps the create form out of the page until the add control opens its dialog", async () => {
    await mount();
    expect(dialog()).toBeNull();
    expect(form()).toBeNull();
    expect(trigger()!.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger()!.getAttribute("aria-expanded")).toBe("false");

    await click(trigger());
    expect(dialog()).not.toBeNull();
    expect(dialog()!.getAttribute("aria-modal")).toBe("true");
    expect(form()).not.toBeNull();
    expect(trigger()!.getAttribute("aria-expanded")).toBe("true");
    expect(form()!.querySelector('input[name="name"]')).not.toBeNull();
    expect(form()!.querySelector('input[name="taskId"]')).not.toBeNull();
    expect(form()!.querySelector('[aria-haspopup="listbox"]')!.textContent).toContain("Personal");
  });

  it("closes on the dialog cancel control and on the shared backdrop", async () => {
    await mount();
    await click(trigger());
    await click(main().querySelector<HTMLButtonElement>("[data-environment-create-cancel]"));
    expect(dialog()).toBeNull();
    expect(form()).toBeNull();
    expect(trigger()!.getAttribute("aria-expanded")).toBe("false");

    await click(trigger());
    expect(dialog()).not.toBeNull();
    await click(main().querySelector<HTMLElement>("[data-dialog-backdrop]"));
    expect(dialog()).toBeNull();
  });

  it("posts the same body to /api/environments, closes and keeps the operation receipt", async () => {
    await mount();
    await click(trigger());
    await typeInto(form()!.querySelector<HTMLInputElement>('input[name="name"]')!, "Atlas VM");
    await click(form()!.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]'));
    const temporary = [...form()!.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(option => option.textContent === "Temporary task environment")!;
    expect(temporary).toBeTruthy();
    await click(temporary);
    await act(async () => { form()!.dispatchEvent(new app!.browser.Event("submit", { bubbles: true, cancelable: true })); });

    await waitForApp(() => posts.length === 1);
    expect(Object.keys(posts[0]!)).toEqual(["operationId", "name", "type", "taskId"]);
    expect(typeof posts[0]!.operationId).toBe("string");
    expect(posts[0]).toMatchObject({ name: "Atlas VM", type: "temporary", taskId: null });

    await waitForApp(() => dialog() === null);
    await waitForApp(() => !!main().querySelector("[data-environment-confirmed-result]"));
    expect(main().querySelector("[data-environment-confirmed-result]")!.textContent).toContain("Atlas VM");
    expect(trigger()!.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps one titled h1, the create action and the type filter above the records region", async () => {
    await mount();
    const section = main().querySelector<HTMLElement>("[data-environments-page]")!;
    const headings = section.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]!.textContent).toBe("Linux environments");
    const content = section.querySelector<HTMLElement>(":scope > div[aria-busy]")!;
    expect(content).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING: the shell opens the page in every state, the list follows it.
    expect(headings[0]!.compareDocumentPosition(content) & 4).toBeTruthy();
    expect(section.querySelector("[data-environment-create-open]")).not.toBeNull();
    const filter = section.querySelector<HTMLElement>('button[aria-haspopup="listbox"]');
    expect(filter).not.toBeNull();
    expect(filter!.textContent).toContain("Filter by type");
    expect(section.querySelector('select[aria-label="Filter by type"]')).toBeNull();
    expect(section.querySelector("[data-applied-filters]")).toBeNull();
  });

  it("applies and clears the type filter through the shared filter surface", async () => {
    await mount();
    await click(main().querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]'));
    const personal = [...main().querySelectorAll<HTMLButtonElement>('[role="option"]')].find(option => option.textContent === "Personal environment");
    expect(personal).toBeTruthy();
    await click(personal!);

    await waitForApp(() => main().querySelector("[data-applied-filters]") !== null);
    expect(main().querySelector("[data-applied-filters]")!.textContent).toContain("Filter by type: Personal environment");
    await click(main().querySelector<HTMLButtonElement>("[data-filters-clear]"));
    await waitForApp(() => main().querySelector("[data-applied-filters]") === null);
    expect(main().querySelectorAll("h1")).toHaveLength(1);
  });

  it("fills the desktop height chain instead of scrolling inside the page", async () => {
    await mount();
    const section = main().querySelector<HTMLElement>("[data-environments-page]")!;
    const wrapper = section.querySelector<HTMLElement>(":scope > div[aria-busy]")!;
    const table = wrapper.querySelector<HTMLElement>("[data-list-mode]")!;
    expect(section.className).toContain("lg:h-full");
    expect(section.className).toContain("lg:min-h-0");
    expect(wrapper.className).toContain("lg:min-h-0");
    expect(wrapper.className).toContain("lg:flex-1");
    expect(table.getAttribute("data-list-mode")).toBe("desktop");
    expect(table.className).toContain("h-full");
    expect(table.className).toContain("min-h-0");
    expect(table.className).toContain("flex-1");
  });
});
