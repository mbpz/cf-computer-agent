import { APP_CONFIG } from "../config";
import { AppError, methodNotAllowed, requireSameOrigin, type RequestContext } from "../http";
import type { GitHubOAuthClient } from "../identity/github-oauth";
import { clearCookie, oauthCookie, readUniqueCookie, sessionCookie } from "../identity/oauth-cookies";
import type { SessionService } from "../identity/session";
import type { MembersService } from "../members/service";

const OAUTH_STATE_COOKIE = "__Host-oauth-state";
const OAUTH_VERIFIER_COOKIE = "__Host-oauth-verifier";
const SESSION_COOKIE = "__Host-memory-session";
const CALLBACK_VALUE = /^[A-Za-z0-9._~-]{1,512}$/u;
const STATE_VALUE = /^[A-Za-z0-9_-]{43}$/u;
const VERIFIER_VALUE = /^[A-Za-z0-9._~-]{43,128}$/u;

export interface AuthRouteServices {
  oauth: GitHubOAuthClient;
  members: Pick<MembersService, "resolveGitHubLogin">;
  sessions: Pick<SessionService, "create" | "logout">;
}

export async function routeAuth(
  request: Request,
  url: URL,
  context: RequestContext,
  services: AuthRouteServices,
): Promise<Response | undefined> {
  if (url.pathname === "/auth/github") {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const start = await services.oauth.createStart();
    const response = redirectResponse(start.authorizationUrl, context);
    response.headers.append("set-cookie", oauthCookie(OAUTH_STATE_COOKIE, start.state));
    response.headers.append("set-cookie", oauthCookie(OAUTH_VERIFIER_COOKIE, start.verifier));
    return response;
  }

  if (url.pathname === "/auth/github/callback") {
    if (request.method !== "GET") return clearOAuthCookies(methodNotAllowed("GET", context));
    const expectedState = readUniqueCookie(request, OAUTH_STATE_COOKIE, 43);
    const verifier = readUniqueCookie(request, OAUTH_VERIFIER_COOKIE, 128);
    const state = uniqueQueryValue(url, "state");
    if (!expectedState
      || !verifier
      || !state
      || !STATE_VALUE.test(expectedState)
      || !STATE_VALUE.test(state)
      || !VERIFIER_VALUE.test(verifier)
      || state !== expectedState) {
      throw callbackInvalid();
    }

    const denial = uniqueQueryValue(url, "error");
    if (denial !== undefined) {
      throw new AppError("OAUTH_CALLBACK_DENIED", "GitHub authorization was denied", 401);
    }
    const code = uniqueQueryValue(url, "code");
    if (!code || !CALLBACK_VALUE.test(code)) throw callbackInvalid();

    const identity = await services.oauth.resolveCallback(code, verifier);
    const member = await services.members.resolveGitHubLogin(identity);
    const session = await services.sessions.create(member);
    const response = clearOAuthCookies(redirectResponse("/", context));
    response.headers.append("set-cookie", sessionCookie(session.token));
    return response;
  }

  if (url.pathname === "/auth/logout") {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireSameOrigin(request, APP_CONFIG.canonicalOrigin);
    await services.sessions.logout(request);
    const response = authResponse(null, 204, context);
    response.headers.append("set-cookie", clearCookie(SESSION_COOKIE));
    return response;
  }

  return undefined;
}

export function clearOAuthCookies(response: Response): Response {
  response.headers.append("set-cookie", clearCookie(OAUTH_STATE_COOKIE));
  response.headers.append("set-cookie", clearCookie(OAUTH_VERIFIER_COOKIE));
  return response;
}

function uniqueQueryValue(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);
  return values.length === 1 ? values[0] : undefined;
}

function redirectResponse(location: string, context: RequestContext): Response {
  const response = authResponse(null, 302, context);
  response.headers.set("location", location);
  return response;
}

function authResponse(body: BodyInit | null, status: number, context: RequestContext): Response {
  return new Response(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "x-request-id": context.requestId,
    },
  });
}

function callbackInvalid(): AppError {
  return new AppError("OAUTH_CALLBACK_INVALID", "OAuth callback is invalid", 400);
}
