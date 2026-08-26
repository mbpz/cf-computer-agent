import { describe, expect, it } from "vitest";
import { buildStructuredLog } from "../../src/ops/structured-log";

describe("structured diagnostic logs", () => {
  it("keeps the allowlisted correlation fields and removes sensitive values", () => {
    const event = buildStructuredLog("warn", {
      requestId: "req-1", stage: "token_exchange", reason: "network", status: 503,
      body: "private note body", code: "oauth-code-secret", APP_TOKEN: "token-secret", extra: "ignored",
    });
    expect(event).toEqual({ level: "warn", requestId: "req-1", stage: "token_exchange", reason: "network", status: 503 });
    expect(JSON.stringify(event)).not.toMatch(/private|oauth-code|token-secret|APP_TOKEN/i);
  });

  it("rejects malformed request IDs and keeps fixed diagnostic values", () => {
    expect(buildStructuredLog("error", { requestId: "oauth-code", code: "INTERNAL_ERROR", message: "secret body" })).toEqual({ level: "error", code: "INTERNAL_ERROR" });
  });
});
