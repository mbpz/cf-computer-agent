import { describe, expect, it } from "vitest";
import { AppError, errorResponse } from "../../src/http";

describe("errorResponse", () => {
  it("returns a stable, safe JSON error with the request ID", async () => {
    const response = errorResponse(new AppError("FORBIDDEN", "Forbidden", 403), "req-1");

    expect(response.status).toBe(403);
    expect(response.headers.get("x-request-id")).toBe("req-1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Forbidden",
        retryable: false,
        requestId: "req-1",
      },
    });
  });
});
