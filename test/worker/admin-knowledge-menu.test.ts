/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MenusRepository } from "../../src/authorization/menus-repository";
import { parsePermissionMask } from "../../src/authorization/permission-bitmap";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { MIGRATIONS } from "../fixtures/d1";

const now = "2026-08-22T00:00:00.000Z";

interface MenuNode { key: string; path: string | null; labelKey: string; groupName: "workspace" | "admin"; children: MenuNode[] }

/**
 * The recycle bin is discoverable the way this repository owns discovery: a seeded
 * system menu row that `/api/navigation` projects and filters by the member's
 * permission mask. The row therefore has to exist, and it must not be served to an
 * administrator who does not hold `knowledge:review`.
 */
describe("recycle bin menu discovery", () => {
  let admin: string;

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at)
       VALUES ('recycle-admin', 'subject-recycle-admin', 'recycle-admin@example.test', 'admin', 'active', ?, ?)`,
    ).bind(now, now).run();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
    admin = (await sessions.create((await members.findById("recycle-admin"))!)).token;
  });

  it("seeds one guarded system menu row for the recycle bin", async () => {
    const row = await env.DB.prepare(
      "SELECT parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system FROM menus WHERE id = 'menu-recycle-bin'",
    ).first();
    // `required_bits` 0x8 is the mask for `knowledge:review`, the same mask the
    // review queue row carries, so the row and the page agree on who may see it.
    expect(row).toEqual({
      parent_id: "menu-admin", key: "recycle-bin", label_key: "NAV_RECYCLE_BIN", path: "/admin/knowledge/trash",
      icon: "Trash", group_name: "admin", position: 10, required_bits: "0x8", status: "active", visible: 1, is_system: 1,
    });
    expect(await env.DB.prepare("SELECT count(*) AS count FROM menus WHERE path = '/admin/knowledge/trash'").first()).toEqual({ count: 1 });
  });

  it("filters the seeded row by the review mask and keeps the entry for a live administrator", async () => {
    // The same rows the migration seeded, projected under two masks. `knowledge:review`
    // is bit 3 = 0x8, which the review queue row also carries, so removing that one bit
    // removes exactly the review-scoped entries and leaves the rest of the group.
    const menus = new MenusRepository(env.DB);
    const granted = await menus.navigation(parsePermissionMask("0x37ffff"));
    expect(flatten(granted.tree).find((node) => node.key === "recycle-bin")).toMatchObject({
      path: "/admin/knowledge/trash", labelKey: "NAV_RECYCLE_BIN",
    });

    const withheld = await menus.navigation(parsePermissionMask("0x37fff7"));
    expect(flatten(withheld.tree).find((node) => node.key === "recycle-bin")).toBeUndefined();
    expect(flatten(withheld.tree).find((node) => node.key === "review")).toBeUndefined();
    expect(flatten(withheld.tree).find((node) => node.key === "members")).toMatchObject({ path: "/admin/members" });

    // The HTTP projection serves it to the administrator this fixture can create. A
    // second active administrator cannot exist (one_active_admin) and an administrator's
    // base mask already holds review, so the mask is the only place the difference shows.
    expect(flatten(await navigation(admin)).find((node) => node.key === "recycle-bin")).toBeDefined();
    const contributor = await contributorNavigation();
    expect(flatten(contributor).some((node) => node.groupName === "admin")).toBe(false);
    expect(flatten(contributor).find((node) => node.key === "recycle-bin")).toBeUndefined();
  });

  it("keeps the seeded row out of the administrator's editable label set only by key", async () => {
    // The menu editor may rename and reorder the row, so the seeded label key must be
    // a real registry label; a typo would render a raw key in the navigation.
    const row = await env.DB.prepare("SELECT label_key FROM menus WHERE id = 'menu-recycle-bin'").first<{ label_key: string }>();
    const { MENU_LABEL_KEYS } = await import("../../shared/admin-menu-fields");
    expect(MENU_LABEL_KEYS).toContain(row!.label_key);
  });
});

function flatten<T extends { children?: readonly T[] }>(nodes: readonly T[]): T[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}

function isMenuNode(value: unknown): value is MenuNode {
  return value !== null && typeof value === "object"
    && "key" in value && typeof value.key === "string"
    && "path" in value && (value.path === null || typeof value.path === "string")
    && "labelKey" in value && typeof value.labelKey === "string"
    && "groupName" in value && (value.groupName === "workspace" || value.groupName === "admin")
    && "children" in value && isMenuNodeList(value.children);
}

function isMenuNodeList(value: unknown): value is MenuNode[] {
  return Array.isArray(value) && value.every((node: unknown) => isMenuNode(node));
}

async function contributorNavigation(): Promise<MenuNode[]> {
  await env.DB.prepare(
    `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at)
     VALUES ('recycle-contributor', 'subject-recycle-contributor', 'recycle-contributor@example.test', 'contributor', 'active', ?, ?)`,
  ).bind(now, now).run();
  const members = new MembersRepository(env.DB);
  const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
  const token = (await sessions.create((await members.findById("recycle-contributor"))!)).token;
  return navigation(token);
}

async function navigation(token: string): Promise<MenuNode[]> {
  const headers = new Headers();
  headers.set("cookie", `__Host-memory-session=${token}`);
  const request = new Request("https://memory.crgmhrc.asia/api/navigation", { headers });
  const context = createExecutionContext();
  const response = await createApp().fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  expect(response.status).toBe(200);
  const payload: unknown = await response.json();
  // The response is the shell's contract: read the tree only after it is checked.
  if (payload === null || typeof payload !== "object" || !("tree" in payload) || !isMenuNodeList(payload.tree)) {
    throw new Error("NAVIGATION_RESPONSE_INVALID");
  }
  return payload.tree;
}
