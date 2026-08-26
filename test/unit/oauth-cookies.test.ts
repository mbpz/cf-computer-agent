import { describe, expect, it } from "vitest";
import { clearCookie, oauthCookie, readUniqueCookie, sessionCookie } from "../../src/identity/oauth-cookies";

describe("OAuth cookie primitives", () => {
  it("reads exactly one canonical ASCII cookie value", () => {
    const request = cookieRequest("theme=dark; __Host-oauth-state=Abc_123-xyz; other=value");
    expect(readUniqueCookie(request, "__Host-oauth-state", 64)).toBe("Abc_123-xyz");
    expect(readUniqueCookie(request, "missing", 64)).toBeUndefined();
  });

  it.each([
    "__Host-oauth-state=one; __Host-oauth-state=two",
    "__Host-oauth-state=one; theme=dark; __Host-oauth-state=one",
    "__Host-oauth-state=",
    "__Host-oauth-state=has%20encoding",
    "__Host-oauth-state=has=padding",
    "__Host-oauth-state=has whitespace",
    "__Host-oauth-state=\"quoted\"",
  ])("rejects ambiguous or malformed target cookies: %s", (header) => {
    expect(readUniqueCookie(cookieRequest(header), "__Host-oauth-state", 128)).toBeUndefined();
  });

  it("rejects a cookie value over its byte bound", () => {
    expect(readUniqueCookie(cookieRequest("__Host-memory-session=123456789"), "__Host-memory-session", 8)).toBeUndefined();
    expect(readUniqueCookie(cookieRequest("__Host-memory-session=12345678"), "__Host-memory-session", 8)).toBe("12345678");
  });

  it.each([
    "__Host-oauth-state=Abc_123-xyz ; theme=dark",
    "__Host-oauth-state= Abc_123-xyz; theme=dark",
    "__Host-oauth-state=Abc_123-xyz\t; theme=dark",
    "__Host-oauth-state=\tAbc_123-xyz; theme=dark",
    "theme=dark;  __Host-oauth-state=Abc_123-xyz",
    "theme=dark;\t__Host-oauth-state=Abc_123-xyz",
  ])("rejects noncanonical whitespace adjacent to the target cookie pair or value: %s", (header) => {
    expect(readUniqueCookie(cookieRequest(header), "__Host-oauth-state", 64)).toBeUndefined();
  });

  it("serializes ten-minute OAuth cookies with exact host-only attributes", () => {
    expect(oauthCookie("__Host-oauth-state", "local_state-123")).toBe(
      "__Host-oauth-state=local_state-123; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600",
    );
    expect(oauthCookie("__Host-oauth-verifier", "local_verifier-123")).toBe(
      "__Host-oauth-verifier=local_verifier-123; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600",
    );
  });

  it("serializes a seven-day host-only session cookie", () => {
    expect(sessionCookie("local_session-123")).toBe(
      "__Host-memory-session=local_session-123; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800",
    );
  });

  it("clears host-only cookies immediately", () => {
    expect(clearCookie("__Host-oauth-state")).toBe(
      "__Host-oauth-state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    );
    expect(clearCookie("__Host-memory-session")).toBe(
      "__Host-memory-session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    );
  });

  it("refuses malformed serialization inputs", () => {
    expect(() => oauthCookie("__Host-oauth-state", "has=padding")).toThrowError("Cookie value is invalid");
    expect(() => sessionCookie("has whitespace")).toThrowError("Cookie value is invalid");
    expect(() => clearCookie("unsafe; Domain=example.test")).toThrowError("Cookie name is invalid");
  });
});

function cookieRequest(cookie: string): Request {
  return new Request("https://memory.crgmhrc.asia/", { headers: { cookie } });
}
