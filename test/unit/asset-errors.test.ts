// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AppError } from "../../src/http";
import { classifyAssetParseFailure } from "../../src/assets/errors";

describe("asset parse failure classification", () => {
  it("preserves allowlisted stable corruption codes as terminal", () => {
    expect(classifyAssetParseFailure(new AppError("ASSET_PPTX_PARSE_UNSUPPORTED", "fixed message", 422)))
      .toEqual({ code: "ASSET_PPTX_PARSE_UNSUPPORTED", terminal: true });
  });

  it("redacts unknown errors and unapproved AppError codes", () => {
    expect(classifyAssetParseFailure(new Error("private provider response with document body")))
      .toEqual({ code: "ASSET_PARSE_RETRYABLE", terminal: false });
    expect(classifyAssetParseFailure(new AppError("SECRET_PROVIDER_BODY", "token=private", 500)))
      .toEqual({ code: "ASSET_PARSE_RETRYABLE", terminal: false });
  });
});
