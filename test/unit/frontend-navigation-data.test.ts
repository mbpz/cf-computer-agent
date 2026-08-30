// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadNavigation, mergeRequiredWorkspaceNavigation } from "../../frontend/lib/navigation-data";

describe("frontend navigation availability", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function loadStaleTree() {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ tree: [{
      id: "workspace", key: "workspace", labelKey: "SHELL_GROUP_WORKSPACE", path: null, icon: null,
      groupName: "workspace", availability: "ready", children: [{
        id: "home", key: "home", labelKey: "NAV_HOME", path: "/", icon: null,
        groupName: "workspace", availability: "ready", children: [],
      }, {
        id: "settings", key: "settings", labelKey: "SHELL_SETTINGS", path: "/settings", icon: null,
        groupName: "workspace", availability: "ready", children: [],
      }, {
        id: "stale-notifications", key: "notifications-retired", labelKey: "NAV_NOTIFICATIONS", path: "/notifications", icon: null,
        groupName: "workspace", availability: "coming_soon", disabledReason: "not_implemented", children: [],
      }],
    }] }), { status: 200, headers: { "content-type": "application/json" } })));
    return loadNavigation();
  }

  it("does not restore Tasks from a stale server tree without its canonical permission bit", async () => {
    const tree = mergeRequiredWorkspaceNavigation(await loadStaleTree(), {
      member: { id: "member-1", email: "reader@example.test", role: "contributor" },
      capabilities: [],
      permissionMask: "0x0",
      logoutUrl: "/auth/logout",
    });
    const children = tree[0]!.children;
    expect(children.map((node) => node.path)).toEqual(["/", "/notifications", "/messages"]);
    expect(children.find((node) => node.path === "/settings")).toBeUndefined();
    expect(children.find((node) => node.path === "/tasks")).toBeUndefined();
    expect(children.find((node) => node.path === "/boards")).toBeUndefined();
    expect(children.find((node) => node.path === "/notifications")).toMatchObject({ availability: "ready" });
    expect(children.find((node) => node.path === "/notifications")?.disabledReason).toBeUndefined();
    expect(children.find((node) => node.path === "/messages")).toMatchObject({ availability: "ready" });
    expect(children.find((node) => node.path === "/messages")?.disabledReason).toBeUndefined();
  });

  it("restores Tasks from a stale server tree when its canonical permission bit is present", async () => {
    const tree = mergeRequiredWorkspaceNavigation(await loadStaleTree(), {
      member: { id: "member-1", email: "reader@example.test", role: "contributor" },
      capabilities: [],
      permissionMask: "0x100000",
      logoutUrl: "/auth/logout",
    });

    expect(tree[0]!.children.map((node) => node.path)).toEqual(["/", "/tasks", "/boards", "/notifications", "/messages"]);
    expect(tree[0]!.children.find((node) => node.path === "/tasks")).toMatchObject({ availability: "ready" });
    expect(tree[0]!.children.find((node) => node.path === "/boards")).toMatchObject({ availability: "ready" });
  });
});
