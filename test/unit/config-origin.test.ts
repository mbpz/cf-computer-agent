// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CANONICAL_ORIGIN, canonicalOrigin, configureCanonicalOrigin, resolveCanonicalOrigin } from "../../src/config";

afterEach(() => { configureCanonicalOrigin(undefined); });

describe("canonical origin configuration", () => {
  it("defaults to production and accepts one exact HTTPS origin", () => {
    expect(resolveCanonicalOrigin(undefined)).toBe(DEFAULT_CANONICAL_ORIGIN);
    expect(resolveCanonicalOrigin("")).toBe(DEFAULT_CANONICAL_ORIGIN);
    expect(resolveCanonicalOrigin("https://acceptance.example.test")).toBe("https://acceptance.example.test");
    configureCanonicalOrigin("https://acceptance.example.test");
    expect(canonicalOrigin()).toBe("https://acceptance.example.test");
  });

  it.each([
    "http://acceptance.example.test",
    "https://acceptance.example.test/",
    "https://acceptance.example.test/path",
    "https://acceptance.example.test?x=1",
    "not a url",
  ])("fails closed for a noncanonical value: %s", (value) => {
    expect(() => resolveCanonicalOrigin(value)).toThrow("PUBLIC_ORIGIN_INVALID");
  });
});
