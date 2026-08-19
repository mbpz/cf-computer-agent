import { APP_CONFIG } from "../config";

const COOKIE_VALUE = /^[A-Za-z0-9_-]+$/;
const COOKIE_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const OAUTH_COOKIE_NAMES = new Set(["__Host-oauth-state", "__Host-oauth-verifier"]);

type OAuthCookieName = "__Host-oauth-state" | "__Host-oauth-verifier";

export function readUniqueCookie(request: Request, name: string, maxBytes: number): string | undefined {
  if (!COOKIE_NAME.test(name) || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) return undefined;
  const header = request.headers.get("cookie");
  if (!header) return undefined;

  let found: string | undefined;
  let occurrences = 0;
  for (const rawSegment of header.split(";")) {
    const segment = rawSegment.trim();
    const equals = segment.indexOf("=");
    const rawName = equals === -1 ? segment : segment.slice(0, equals);
    if (rawName.trim() !== name) continue;
    occurrences += 1;
    if (occurrences > 1 || equals === -1 || rawName !== name) return undefined;
    const value = segment.slice(equals + 1);
    if (!isCookieValue(value, maxBytes)) return undefined;
    found = value;
  }
  return occurrences === 1 ? found : undefined;
}

export function oauthCookie(name: OAuthCookieName, value: string): string {
  if (!OAUTH_COOKIE_NAMES.has(name)) throw new Error("Cookie name is invalid");
  return serializeCookie(name, value, APP_CONFIG.oauthTemporaryCookieMaxAgeSeconds);
}

export function sessionCookie(value: string): string {
  return serializeCookie("__Host-memory-session", value, APP_CONFIG.sessionCookieMaxAgeSeconds);
}

export function clearCookie(name: string): string {
  if (!COOKIE_NAME.test(name)) throw new Error("Cookie name is invalid");
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function serializeCookie(name: string, value: string, maxAge: number): string {
  if (!COOKIE_NAME.test(name)) throw new Error("Cookie name is invalid");
  if (!isCookieValue(value, 1024)) throw new Error("Cookie value is invalid");
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function isCookieValue(value: string, maxBytes: number): boolean {
  return value.length <= maxBytes && COOKIE_VALUE.test(value);
}
