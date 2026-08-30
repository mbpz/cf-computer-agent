// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pageKindForPath } from "../../frontend/app-routes";
import { WORKSPACE_ROUTE_CAPABILITIES, routeCapability } from "../../shared/workspace-route-capabilities";

describe("React app route dispatch", () => {
  it.each([
    ["/", "home"], ["/knowledge", "knowledge"], ["/search", "search"], ["/agent", "agent"],
    ["/submit", "submit"], ["/my-submissions", "my-submissions"], ["/tasks", "tasks"], ["/boards", "boards"], ["/notifications", "notifications"],
    ["/messages", "messages"], ["/messages/thread-1", "message-thread"], ["/admin", "admin"],
    ["/admin/submissions", "admin-submissions"], ["/admin/duplicates", "admin-duplicates"], ["/admin/assets", "admin-assets"],
    ["/admin/members", "admin-members"], ["/admin/spaces", "admin-spaces"], ["/admin/audit", "admin-audit"],
  ])("dispatches %s", (path, expected) => {
    expect(pageKindForPath(path)).toBe(expected);
  });

  it("keeps unknown and non-UI paths out of the React shell", () => {
    expect(pageKindForPath("/unknown")).toBe("not-found");
    expect(pageKindForPath("/api/session")).toBe("not-found");
    expect(pageKindForPath(`/messages/${"x".repeat(129)}`)).toBe("not-found");
  });

  it("distinguishes registered coming-soon routes from unknown paths", () => {
    expect(routeCapability("/knowledge")?.availability).toBe("ready");
    expect(routeCapability("/tasks")?.availability).toBe("ready");
    expect(routeCapability("/boards")).toMatchObject({ availability: "ready", pageKind: "boards", requiredPermission: "workspace.tasks" });
    expect(routeCapability("/notifications")).toMatchObject({ availability: "ready", pageKind: "notifications" });
    expect(pageKindForPath("/notifications")).toBe("notifications");
    expect(routeCapability("/messages")).toMatchObject({ availability: "ready", pageKind: "messages" });
    expect(pageKindForPath("/messages")).toBe("messages");
    expect(pageKindForPath("/messages/thread-1")).toBe("message-thread");
  });

  it("dispatches every canonical ready route to its registered component kind", () => {
    for (const route of WORKSPACE_ROUTE_CAPABILITIES) {
      expect(pageKindForPath(route.path)).toBe(route.pageKind);
      if (route.availability === "ready") expect(route.pageKind).not.toBe("coming-soon");
    }
  });
});
