import { APP_CONFIG } from "../config";
import { AppError, errorResponse, jsonResponse, logRequestFailure, methodNotAllowed, requireNoQuery, requireSameOrigin, type RequestContext } from "../http";
import type { GitHubOAuthClient } from "../identity/github-oauth";
import type { WeChatOAuthClient } from "../identity/wechat-oauth";
import { clearCookie, oauthCookie, readUniqueCookie, sessionCookie } from "../identity/oauth-cookies";
import type { SessionService } from "../identity/session";
import type { PasswordAuthService } from "../password/service";
import type { MembersService } from "../members/service";
import { parseJsonRequestAs, strictRecord } from "./member";

const OAUTH_STATE_COOKIE = "__Host-oauth-state";
const OAUTH_VERIFIER_COOKIE = "__Host-oauth-verifier";
const SESSION_COOKIE = "__Host-memory-session";
const CALLBACK_VALUE = /^[A-Za-z0-9._~-]{1,512}$/u;
const STATE_VALUE = /^[A-Za-z0-9_-]{43}$/u;
const VERIFIER_VALUE = /^[A-Za-z0-9._~-]{43,128}$/u;
const WECHAT_STATE_COOKIE = "__Host-wechat-state";

export interface AuthRouteServices {
  oauth: GitHubOAuthClient;
  wechat: WeChatOAuthClient;
  members: Pick<MembersService, "resolveGitHubLogin" | "resolveWeChatLogin">;
  passwords: Pick<PasswordAuthService, "register" | "login" | "resetPassword">;
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

    const codes = url.searchParams.getAll("code");
    const errors = url.searchParams.getAll("error");
    if (codes.length + errors.length !== 1) throw callbackInvalid();
    if (errors.length === 1) {
      throw new AppError("OAUTH_CALLBACK_DENIED", "GitHub authorization was denied", 401);
    }
    const code = codes[0];
    if (!code || !CALLBACK_VALUE.test(code)) throw callbackInvalid();

    const identity = await services.oauth.resolveCallback(code, verifier);
    const member = await services.members.resolveGitHubLogin(identity);
    const session = await services.sessions.create(member);
    const response = clearOAuthCookies(redirectResponse("/", context));
    response.headers.append("set-cookie", sessionCookie(session.token));
    return response;
  }

  if (url.pathname === "/auth/wechat") {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const start = await services.wechat.createStart();
    const response = redirectResponse(start.authorizationUrl, context);
    response.headers.append("set-cookie", oauthCookie(WECHAT_STATE_COOKIE, start.state));
    return response;
  }

  if (url.pathname === "/auth/wechat/callback") {
    if (request.method !== "GET") return clearWeChatCookie(methodNotAllowed("GET", context));
    const expectedState = readUniqueCookie(request, WECHAT_STATE_COOKIE, 43);
    const state = uniqueQueryValue(url, "state");
    if (!expectedState || !state || !STATE_VALUE.test(expectedState) || !STATE_VALUE.test(state) || state !== expectedState) throw callbackInvalid();
    const code = uniqueQueryValue(url, "code");
    if (!code) throw callbackInvalid();
    const identity = await services.wechat.resolveCallback(code);
    const member = await services.members.resolveWeChatLogin(identity);
    const session = await services.sessions.create(member);
    const response = clearWeChatCookie(redirectResponse("/", context));
    response.headers.append("set-cookie", sessionCookie(session.token));
    return response;
  }

  if (url.pathname === "/auth/register") {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    requireSameOrigin(request, APP_CONFIG.canonicalOrigin);
    const input = await parsePasswordAuthRequest(request);
    const registered = await services.passwords.register({
      ...input,
      ip: request.headers.get("cf-connecting-ip") ?? "",
    });
    const member = registered.member;
    const session = await services.sessions.create(member);
    const response = jsonResponse({
      member: { id: member.id, email: member.email, role: member.role },
      recoveryCode: registered.recoveryCode,
    }, 201, context.requestId);
    response.headers.append("set-cookie", sessionCookie(session.token));
    return response;
  }

  if (url.pathname === "/auth/password/reset") {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    requireSameOrigin(request, APP_CONFIG.canonicalOrigin);
    const input = await parsePasswordResetRequest(request);
    const reset = await services.passwords.resetPassword(input);
    return jsonResponse({ recoveryCode: reset.recoveryCode }, 200, context.requestId);
  }

  if (url.pathname === "/auth/password") {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    requireSameOrigin(request, APP_CONFIG.canonicalOrigin);
    const input = await parsePasswordAuthRequest(request);
    const member = await services.passwords.login(input);
    const session = await services.sessions.create(member);
    const response = jsonResponse({
      member: { id: member.id, email: member.email, role: member.role },
    }, 200, context.requestId);
    response.headers.append("set-cookie", sessionCookie(session.token));
    return response;
  }

  if (url.pathname === "/auth/logout") {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireSameOrigin(request, APP_CONFIG.canonicalOrigin);
    let response: Response;
    try {
      await services.sessions.logout(request);
      response = authResponse(null, 204, context);
    } catch (error) {
      logRequestFailure(request, context, error);
      response = errorResponse(error, context.requestId);
    }
    return clearSessionCookie(response);
  }

  return undefined;
}

export function clearOAuthCookies(response: Response): Response {
  response.headers.append("set-cookie", clearCookie(OAUTH_STATE_COOKIE));
  response.headers.append("set-cookie", clearCookie(OAUTH_VERIFIER_COOKIE));
  return response;
}

export function clearWeChatCookie(response: Response): Response {
  response.headers.append("set-cookie", clearCookie(WECHAT_STATE_COOKIE));
  return response;
}

export function clearSessionCookie(response: Response): Response {
  response.headers.append("set-cookie", clearCookie(SESSION_COOKIE));
  return response;
}

async function parsePasswordResetRequest(request: Request): Promise<{ email: string; recoveryCode: string; password: string }> {
  const input = strictRecord(
    await parseJsonRequestAs(request, "PASSWORD_RESET_REQUEST_INVALID"),
    ["email", "recoveryCode", "password"],
    "PASSWORD_RESET_REQUEST_INVALID",
  );
  if (typeof input.email !== "string" || typeof input.recoveryCode !== "string" || typeof input.password !== "string") {
    throw new AppError("PASSWORD_RESET_REQUEST_INVALID", "Password reset request is invalid", 400);
  }
  return { email: input.email, recoveryCode: input.recoveryCode, password: input.password };
}

async function parsePasswordAuthRequest(request: Request): Promise<{ email: string; password: string }> {
  const input = strictRecord(
    await parseJsonRequestAs(request, "PASSWORD_AUTH_REQUEST_INVALID"),
    ["email", "password"],
    "PASSWORD_AUTH_REQUEST_INVALID",
  );
  if (typeof input.email !== "string" || typeof input.password !== "string") {
    throw new AppError("PASSWORD_AUTH_REQUEST_INVALID", "Password authentication request is invalid", 400);
  }
  return { email: input.email, password: input.password };
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
