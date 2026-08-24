import { describe, expect, it } from "vitest";
import { analyzeSensitiveContent } from "../../src/publication/sensitive-advisor";

describe("sensitive publication advisor", () => {
  it("returns admin-only findings without copying secret values", () => {
    const token = "ghp_1234567890abcdefghijklmnop";
    const result = analyzeSensitiveContent(`# Example\n\nAuthorization: Bearer ${token}\n`);

    expect(result.status).toBe("advisory");
    expect(result.findings).toEqual([
      expect.objectContaining({ code: "credential", severity: "high", line: 3 }),
    ]);
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it("detects private keys and internal endpoints, while ignoring documentation placeholders", () => {
    const result = analyzeSensitiveContent([
      "示例：api_key = 'your-secret-placeholder'",
      "-----BEGIN PRIVATE KEY-----",
      "调试地址：http://192.168.1.20:8787/health",
    ].join("\n"));

    expect(result.findings).toEqual([
      expect.objectContaining({ code: "private_key", line: 2 }),
      expect.objectContaining({ code: "internal_endpoint", line: 3 }),
    ]);
  });

  it("caps findings and keeps code examples with test values clear", () => {
    const result = analyzeSensitiveContent(Array.from({ length: 30 }, (_, index) => `password = test-value-${index}`).join("\n"));
    expect(result).toEqual({ status: "clear", findings: [] });
  });
});
