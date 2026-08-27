import { describe, expect, it } from "vitest";
import { visitDimensions } from "../../src/analytics/identity";

describe("analytics visit dimensions", () => {
  it("masks IPv4 and keeps Cloudflare location dimensions", () => {
    const request = new Request("https://memory.crgmhrc.asia/", { headers: {
      "cf-connecting-ip": "203.0.113.10",
      "cf-ipcountry": "KR",
      "cf-region": "Seoul",
      "cf-ipcity": "Gangseo-gu",
      "cf-colo": "ICN",
      "user-agent": "test-browser",
    } });
    expect(visitDimensions(request)).toEqual({ ip: "203.0.113.0", country: "KR", region: "Seoul", city: "Gangseo-gu", colo: "ICN", userAgent: "test-browser" });
  });

  it("masks IPv6 and rejects oversized or empty dimensions", () => {
    const request = new Request("https://memory.crgmhrc.asia/", { headers: {
      "cf-connecting-ip": "2001:db8:abcd:0012:0000:0000:0000:0001",
      "cf-region": " ",
      "cf-ipcity": "x".repeat(81),
    } });
    expect(visitDimensions(request)).toMatchObject({ ip: "2001:db8:abcd:0012::", country: null, region: null, city: null, colo: null });
  });
});
