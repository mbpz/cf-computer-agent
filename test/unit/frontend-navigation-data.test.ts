// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadNavigation } from "../../frontend/lib/navigation-data";

describe("frontend navigation availability", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("adds missing canonical coming-soon entries without overriding server routes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ tree: [{
      id: "workspace", key: "workspace", labelKey: "SHELL_GROUP_WORKSPACE", path: null, icon: null,
      groupName: "workspace", availability: "ready", children: [{
        id: "home", key: "home", labelKey: "NAV_HOME", path: "/", icon: null,
        groupName: "workspace", availability: "ready", children: [],
      }],
    }] }), { status: 200, headers: { "content-type": "application/json" } })));

    const tree = await loadNavigation();
    const children = tree[0]!.children;
    expect(children.filter((node) => node.path === "/")).toHaveLength(1);
    expect(children.filter((node) => node.availability === "coming_soon").map((node) => node.path)).toEqual([
      "/boards", "/notifications", "/messages",
    ]);
    expect(children.find((node) => node.path === "/notifications")).toMatchObject({ disabledReason: "not_implemented" });
  });
});
