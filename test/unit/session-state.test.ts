import { describe, expect, it } from "vitest";
import { ApiRequestError } from "../../frontend/lib/api";
import { isAnonymousSessionError } from "../../frontend/lib/session-state";

describe("session state", () => {
  it("treats an expired or logged-out session as anonymous", () => {
    expect(isAnonymousSessionError(new ApiRequestError("AUTH_REQUIRED", "Authentication required", 401, false))).toBe(true);
  });

  it("does not hide upstream or authorization failures as anonymous", () => {
    expect(isAnonymousSessionError(new ApiRequestError("FORBIDDEN", "Forbidden", 403, false))).toBe(false);
    expect(isAnonymousSessionError(new ApiRequestError("INTERNAL_ERROR", "Internal error", 500, true))).toBe(false);
    expect(isAnonymousSessionError(new Error("Authentication required"))).toBe(false);
  });
});
