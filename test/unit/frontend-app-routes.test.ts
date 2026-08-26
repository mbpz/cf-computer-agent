// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pageKindForPath } from "../../frontend/app-routes";

describe("React app route dispatch", () => {
  it.each([
    ["/", "home"], ["/knowledge", "knowledge"], ["/search", "search"], ["/agent", "agent"],
    ["/submit", "submit"], ["/my-submissions", "my-submissions"], ["/admin", "admin"],
    ["/admin/submissions", "admin-submissions"], ["/admin/duplicates", "admin-duplicates"], ["/admin/assets", "admin-assets"],
    ["/admin/members", "admin-members"], ["/admin/spaces", "admin-spaces"], ["/admin/audit", "admin-audit"],
  ])("dispatches %s", (path, expected) => {
    expect(pageKindForPath(path)).toBe(expected);
  });

  it("keeps unknown and non-UI paths out of the React shell", () => {
    expect(pageKindForPath("/unknown")).toBe("not-found");
    expect(pageKindForPath("/api/session")).toBe("not-found");
  });
});
