/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MENU_LABEL_KEYS } from "../../shared/admin-menu-fields";
import { WORKSPACE_ROUTE_CAPABILITIES, type WorkspaceRouteCapability } from "../../shared/workspace-route-capabilities";
import { parsePermissionMask, permissionMaskFor, serializePermissionMask } from "../../src/authorization/permission-bitmap";
import { buildMenuTree, type MenuRow as MenuTreeRow } from "../../src/authorization/menu-tree";
import { MIGRATIONS } from "../fixtures/d1";

interface MenuRow {
  id: string;
  parent_id: string | null;
  key: string;
  label_key: string;
  path: string | null;
  group_name: string;
  position: number;
  required_bits: string;
  is_system: number;
}

// `/settings` is rendered by the shell account menu and stripped from the
// navigation tree, so it is intentionally not seeded as an admin-managed menu.
const UNSEEDED_ROUTE_IDS: readonly string[] = ["settings"];

// The deterministic workspace order the admin editor and the member navigation
// both read. `/environments` stays last because it is the only workspace.vm entry.
// The knowledge family (`menu-search`, `menu-agent`, `menu-submit`,
// `menu-my-submissions`) is no longer flat here: it hangs beneath `menu-knowledge`
// (0031 for search/agent, 0074 for submit/my-submissions), which keeps
// `/knowledge` as that entry's own destination.
const WORKSPACE_SEED_ORDER = [
  "menu-home", "menu-knowledge", "menu-tasks", "menu-boards",
  "menu-notifications", "menu-messages", "menu-inbox", "menu-goals", "menu-projects", "menu-graph",
  "menu-calendar", "menu-today", "menu-focus", "menu-workbench-review", "menu-environments",
] as const;

// The one top-level knowledge entry's children, in seeded position order.
const KNOWLEDGE_SEED_ORDER = ["menu-search", "menu-agent", "menu-submit", "menu-my-submissions"] as const;

// The masks these four rows were published with. The re-parenting migration must
// not move them: the family reads as nested navigation, not as a new gate.
const KNOWLEDGE_CHILD_BITS: Readonly<Record<string, string>> = {
  "menu-search": "0x40000", "menu-agent": "0x20000", "menu-submit": "0x40", "menu-my-submissions": "0x80",
};

describe("menu seed integrity against the shared route registry", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
  });

  async function menuRows(): Promise<MenuRow[]> {
    return (await env.DB.prepare(
      "SELECT id, parent_id, key, label_key, path, group_name, position, required_bits, is_system FROM menus",
    ).all<MenuRow>()).results;
  }

  it("keeps every seeded label key inside the canonical admin menu registry", async () => {
    const labels = new Set<string>(MENU_LABEL_KEYS);
    const unknown = (await menuRows()).filter((row) => !labels.has(row.label_key)).map((row) => `${row.id}:${row.label_key}`);
    expect(unknown).toEqual([]);
  });

  it("seeds exactly one row per ready route carrying the registry permission mask", async () => {
    const rows = await menuRows();
    const routes: readonly WorkspaceRouteCapability[] = WORKSPACE_ROUTE_CAPABILITIES;
    let permissionChecks = 0;
    for (const route of routes) {
      if (UNSEEDED_ROUTE_IDS.includes(route.id)) continue;
      const matched = rows.filter((row) => row.path === route.path);
      expect(matched.map((row) => row.id), `${route.path} must have exactly one seeded row`).toHaveLength(1);
      const row = matched[0]!;
      // The row label key must stay registry-valid (asserted above); it is not
      // required to equal the registry labelKey because 0031 intentionally
      // relabels the nested knowledge children (/search, /agent).
      expect(row.group_name, `${route.path} group`).toBe(route.group);
      if (route.requiredPermission) {
        permissionChecks += 1;
        expect(row.required_bits, `${route.path} must carry ${route.requiredPermission}`)
          .toBe(serializePermissionMask(permissionMaskFor([route.requiredPermission])));
      }
    }
    // graph, tasks, goals, projects, calendar, today, focus, review, inbox,
    // boards (workspace.tasks) and environments (workspace.vm).
    expect(permissionChecks).toBe(11);
  });

  it("keeps every seeded path attached to a known route", async () => {
    const knownPaths = new Set<string>(WORKSPACE_ROUTE_CAPABILITIES.map((route) => route.path));
    const orphaned = (await menuRows())
      .filter((row) => row.path !== null && !knownPaths.has(row.path))
      .map((row) => `${row.id}:${row.path}`);
    expect(orphaned).toEqual([]);
  });

  it("keeps the workspace review entry distinct from the admin review queue", async () => {
    const rows = await menuRows();
    // The workspace /review row cannot use id `menu-review` or key `review`:
    // migrations/0029 already gives those to the /admin/submissions review
    // queue (menus.id is PRIMARY KEY and menus.key is UNIQUE), so the workspace
    // entry uses the workbench-review name. These two assertions fail loudly if
    // a future rename swaps or collides them.
    expect(rows.filter((row) => row.path === "/review").map((row) => row.key)).toEqual(["workbench-review"]);
    expect(rows.filter((row) => row.key === "review").map((row) => row.path)).toEqual(["/admin/submissions"]);
  });

  it("keeps seeded group containers from hiding pages their own mask allows", async () => {
    const rows = await menuRows();
    const descendants = (parentId: string): MenuRow[] => rows
      .filter((row) => row.parent_id === parentId)
      .flatMap((child) => [child, ...descendants(child.id)]);
    // A path-less group root is a container: hiding it hides every descendant,
    // so its mask must never be stricter than a seeded page descendant's mask.
    const violations = rows
      .filter((row) => row.path === null && row.is_system === 1)
      .flatMap((container) => {
        const pages = descendants(container.id).filter((child) => child.is_system === 1 && child.path !== null);
        if (pages.length === 0) return [];
        const containerMask = parsePermissionMask(container.required_bits);
        return pages
          .filter((page) => (parsePermissionMask(page.required_bits) & containerMask) !== containerMask)
          .map((page) => `${container.id}:${container.required_bits} hides ${page.id}:${page.required_bits}`);
      });
    expect(violations).toEqual([]);
  });

  it("keeps system sibling positions unique and the workspace order deterministic", async () => {
    const rows = await menuRows();
    const collisions: string[] = [];
    const seen = new Set<string>();
    for (const row of rows.filter((candidate) => candidate.is_system === 1)) {
      const key = `${row.parent_id ?? "<root>"}:${row.position}`;
      if (seen.has(key)) collisions.push(`${key}:${row.id}`);
      seen.add(key);
    }
    expect(collisions).toEqual([]);

    const order = rows
      .filter((row) => row.parent_id === "menu-workspace" && row.group_name === "workspace" && row.is_system === 1 && row.path !== null)
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
      .map((row) => row.id);
    expect(order).toEqual([...WORKSPACE_SEED_ORDER]);

    const knowledgeOrder = rows
      .filter((row) => row.parent_id === "menu-knowledge" && row.is_system === 1)
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
      .map((row) => row.id);
    expect(knowledgeOrder).toEqual([...KNOWLEDGE_SEED_ORDER]);
  });

  it("keeps the knowledge family under one top-level entry in both layers", async () => {
    const rows = await menuRows();
    const children = rows.filter((row) => row.parent_id === "menu-knowledge");
    // The parent is still its own page: /knowledge stays reachable in one click.
    expect(rows.find((row) => row.id === "menu-knowledge")).toMatchObject({
      parent_id: "menu-workspace", path: "/knowledge", label_key: "NAV_KNOWLEDGE_BASE", required_bits: "0x1",
    });
    // Re-parenting changed only the tree shape: every child keeps its own URL,
    // label and published mask, so no capability gate moved with it.
    expect(Object.fromEntries(children.map((row) => [row.id, row.required_bits]))).toEqual(KNOWLEDGE_CHILD_BITS);
    expect(children.every((row) => row.group_name === "workspace" && row.is_system === 1 && row.path !== null)).toBe(true);
    // The registry states the same nesting (`parentRouteId`), in the same order,
    // so the client fallback tree and the seeded rows agree by construction.
    const routes: readonly WorkspaceRouteCapability[] = WORKSPACE_ROUTE_CAPABILITIES;
    const declared = routes.filter((route) => route.parentRouteId !== undefined);
    expect(declared.map((route) => route.id)).toEqual(["search", "agent", "submit", "my-submissions"]);
    expect(declared.every((route) => route.parentRouteId === "knowledge")).toBe(true);
    expect(declared.map((route) => `menu-${route.id}`)).toEqual([...KNOWLEDGE_SEED_ORDER]);
  });

  it("projects only the knowledge children a partial mask may reach", async () => {
    const rows = (await env.DB.prepare(
      `SELECT id, parent_id AS parentId, key, label_key AS labelKey, path, icon, group_name AS groupName,
              position, required_bits AS requiredBits, status, visible, is_system AS isSystem
       FROM menus`,
    ).all<MenuTreeRow>()).results;
    const family = (mask: bigint): string[] => buildMenuTree(rows, mask)
      .find((node) => node.id === "menu-workspace")?.children
      .find((node) => node.id === "menu-knowledge")?.children.map((node) => node.id) ?? [];

    // The family parent itself is gated by knowledge:read, so a member without it
    // never receives the entry and no child leaks through the nesting.
    const withoutRead = buildMenuTree(rows, permissionMaskFor(["submission:create"]))
      .find((node) => node.id === "menu-workspace")?.children.map((node) => node.id) ?? [];
    expect(withoutRead).not.toContain("menu-knowledge");
    expect(withoutRead).not.toContain("menu-submit");

    // With the family entry but only part of the family's capabilities, exactly
    // the reachable children survive — nesting never hands out an extra gate.
    // `menu-submit` is seeded but hidden by 0075, so no mask projects it: the
    // composer is entered from the 我的提交 header instead.
    expect(family(permissionMaskFor(["knowledge:read"]))).toEqual([]);
    expect(family(permissionMaskFor(["knowledge:read", "submission:create"]))).toEqual([]);
    expect(family(permissionMaskFor(["knowledge:read", "submission:read-own"]))).toEqual(["menu-my-submissions"]);
    expect(family(permissionMaskFor(["knowledge:read", "search:use", "agent:use"]))).toEqual(["menu-search", "menu-agent"]);
    // A full administrator mask reaches the whole visible family in seeded order.
    expect(family(parsePermissionMask("0x7ffff"))).toEqual(["menu-search", "menu-agent", "menu-my-submissions"]);
  });

  it("hides the submit entry from navigation while keeping its route capability", async () => {
    const rows = (await env.DB.prepare(
      `SELECT id, parent_id AS parentId, key, label_key AS labelKey, path, icon, group_name AS groupName,
              position, required_bits AS requiredBits, status, visible, is_system AS isSystem
       FROM menus WHERE id = 'menu-submit'`,
    ).all<MenuTreeRow>()).results;
    // Only visibility changed: the row keeps its URL, label, mask, parent and
    // position, so an administrator can still inspect it in the menu editor.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "menu-submit", parentId: "menu-knowledge", key: "submit", labelKey: "NAV_SUBMIT",
      path: "/submit", groupName: "workspace", position: 2, requiredBits: "0x40", status: "active", visible: 0, isSystem: 1,
    });
    // Neither role's projection carries the entry: the administrator's full mask
    // and the contributor mask that can create submissions both skip it.
    const allRows = (await env.DB.prepare(
      `SELECT id, parent_id AS parentId, key, label_key AS labelKey, path, icon, group_name AS groupName,
              position, required_bits AS requiredBits, status, visible, is_system AS isSystem
       FROM menus`,
    ).all<MenuTreeRow>()).results;
    const projectedPaths = (mask: bigint): string[] => {
      const paths: string[] = [];
      const pending = [...buildMenuTree(allRows, mask)];
      while (pending.length > 0) {
        const node = pending.pop()!;
        if (node.path !== null) paths.push(node.path);
        pending.push(...node.children);
      }
      return paths;
    };
    expect(projectedPaths(parsePermissionMask("0x7ffff"))).not.toContain("/submit");
    expect(projectedPaths(permissionMaskFor(["knowledge:read", "submission:create", "submission:read-own"]))).not.toContain("/submit");
    // The route itself is unchanged: `/submit` stays a ready page gated by
    // submission:create, and only its navigation entry is withheld.
    const route = WORKSPACE_ROUTE_CAPABILITIES.find((candidate) => candidate.path === "/submit");
    expect(route).toMatchObject({ id: "submit", pageKind: "submit", availability: "ready", capability: "submission:create" });
    expect(route?.hiddenFromNavigation).toBe(true);
  });
});
