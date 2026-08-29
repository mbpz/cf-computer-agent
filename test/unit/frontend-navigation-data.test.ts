// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadNavigation } from "../../frontend/lib/navigation-data";

describe("frontend navigation availability", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves server hierarchy without re-adding registry-only routes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ tree: [{
      id: "workspace", key: "workspace", labelKey: "SHELL_GROUP_WORKSPACE", path: null, icon: null,
      groupName: "workspace", availability: "ready", children: [{
        id: "home", key: "home", labelKey: "NAV_HOME", path: "/", icon: null,
        groupName: "workspace", availability: "ready", children: [],
      }, {
        id: "notifications", key: "notifications", labelKey: "NAV_NOTIFICATIONS", path: "/notifications", icon: null,
        groupName: "workspace", availability: "coming_soon", disabledReason: "not_implemented", children: [],
      }],
    }] }), { status: 200, headers: { "content-type": "application/json" } })));

    const tree = await loadNavigation();
    const children = tree[0]!.children;
    expect(children.map((node) => node.path)).toEqual(["/", "/notifications"]);
    expect(children[1]).toMatchObject({ availability: "coming_soon", disabledReason: "not_implemented" });
  });
});
