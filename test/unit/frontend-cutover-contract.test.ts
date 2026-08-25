// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PUBLIC_ROUTE_MATRIX, isKnownReactRoute } from "../../frontend/cutover-contract";
import { ROUTES } from "../../frontend/contracts/routes";
import { ApiRequestError } from "../../frontend/lib/api";
import { parseSessionPayload } from "../../frontend/contracts/api";

describe("frontend cutover contract", () => {
  it("maps every frozen route to the React shell without broadening API paths", () => {
    for (const route of ROUTES) expect(PUBLIC_ROUTE_MATRIX.some((entry) => entry.path === route.path)).toBe(true);
    expect(PUBLIC_ROUTE_MATRIX).toHaveLength(ROUTES.length);
    expect(isKnownReactRoute("/knowledge")).toBe(true);
    expect(isKnownReactRoute("/admin/submissions/review-1")).toBe(true);
    expect(isKnownReactRoute("/api/session")).toBe(false);
    expect(isKnownReactRoute("/admin/publications/recover")).toBe(false);
    expect(isKnownReactRoute("/unknown")).toBe(false);
  });

  it("keeps auth errors structured and does not retain credential/body content", () => {
    const error = new ApiRequestError("FORBIDDEN", "Access denied", 403, false, "req-1");
    expect(JSON.stringify(error)).not.toContain("secret");
    expect(() => parseSessionPayload({ member: { id: "m", email: "a@example.com", role: "admin" }, capabilities: ["admin:all"], logoutUrl: "https://evil.test" })).toThrow("SESSION_INVALID");
  });
});
