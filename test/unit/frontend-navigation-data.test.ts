// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadNavigation, mergeRequiredWorkspaceNavigation } from "../../frontend/lib/navigation-data";

describe("frontend navigation availability", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("merges required collaboration routes after parsing a stale server tree", async () => {
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

    const tree = mergeRequiredWorkspaceNavigation(await loadNavigation(), {
      member: { id: "member-1", email: "reader@example.test", role: "contributor" },
      capabilities: [],
      logoutUrl: "/auth/logout",
    });
    const children = tree[0]!.children;
    expect(children.map((node) => node.path)).toEqual(["/", "/tasks", "/boards", "/notifications", "/messages"]);
    expect(children.find((node) => node.path === "/settings")).toBeUndefined();
    expect(children.find((node) => node.path === "/tasks")).toMatchObject({ availability: "ready" });
    for (const path of ["/boards", "/notifications", "/messages"]) {
      expect(children.find((node) => node.path === path)).toMatchObject({ availability: "coming_soon", disabledReason: "not_implemented" });
    }
  });
});
