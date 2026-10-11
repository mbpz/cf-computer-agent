/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MENU_LABEL_KEYS } from "../../shared/admin-menu-fields";
import { WORKSPACE_ROUTE_CAPABILITIES, type WorkspaceRouteCapability } from "../../shared/workspace-route-capabilities";
import { parsePermissionMask, permissionMaskFor, serializePermissionMask } from "../../src/authorization/permission-bitmap";
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
const WORKSPACE_SEED_ORDER = [
  "menu-home", "menu-knowledge", "menu-submit", "menu-my-submissions", "menu-tasks", "menu-boards",
  "menu-notifications", "menu-messages", "menu-inbox", "menu-goals", "menu-projects", "menu-graph",
  "menu-calendar", "menu-today", "menu-focus", "menu-workbench-review", "menu-environments",
] as const;

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
  });
});
