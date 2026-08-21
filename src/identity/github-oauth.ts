import { APP_CONFIG } from "../config";
import { AppError } from "../http";
import { canonicalEmail } from "./email";

const OAUTH_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";
const CALLBACK_INPUT = /^[A-Za-z0-9._~-]{1,512}$/;
const PKCE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const ACCESS_TOKEN = /^[A-Za-z0-9._~-]{1,1024}$/;

export interface GitHubIdentity {
  subject: `github:${string}`;
  githubUserId: string;
  email: string;
}

export interface OAuthStart {
  authorizationUrl: string;
  state: string;
  verifier: string;
}

export interface GitHubOAuthClient {
  createStart(): Promise<OAuthStart>;
  resolveCallback(code: string, verifier: string): Promise<GitHubIdentity>;
}

export interface GitHubOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export type GitHubOAuthStage = "token_exchange" | "user_fetch" | "email_fetch";
export type GitHubOAuthFailureReason = "status" | "redirect" | "url" | "content_type" | "timeout" | "payload" | "network";

export interface GitHubOAuthDiagnostic {
  stage: GitHubOAuthStage;
  reason: GitHubOAuthFailureReason;
  httpStatus?: number;
}

export interface GitHubOAuthDependencies {
  fetch: typeof fetch;
  now: () => number;
  randomBytes: (length: number) => Uint8Array;
  timeoutMs?: number;
  onUpstreamFailure?: (diagnostic: GitHubOAuthDiagnostic) => void;
}

export function createGitHubOAuthClient(
  credentials: GitHubOAuthCredentials,
  dependencies: GitHubOAuthDependencies,
): GitHubOAuthClient {
  const timeoutMs = dependencies.timeoutMs ?? APP_CONFIG.githubOAuthTimeoutMs;

  return {
    async createStart(): Promise<OAuthStart> {
      requireConfiguration(credentials, timeoutMs);
      try {
        const state = randomBase64Url(dependencies.randomBytes, 32);
        const verifier = randomBase64Url(dependencies.randomBytes, 32);
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
        const codeChallenge = base64Url(new Uint8Array(digest));
        const url = new URL(OAUTH_AUTHORIZE_URL);
        url.search = new URLSearchParams({
          client_id: credentials.clientId,
          redirect_uri: APP_CONFIG.githubOAuthCallbackUrl,
          scope: "read:user user:email",
          state,
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
          allow_signup: "false",
        }).toString();
        return { authorizationUrl: url.toString(), state, verifier };
      } catch {
        throw oauthUnavailable();
      }
    },

    async resolveCallback(code: string, verifier: string): Promise<GitHubIdentity> {
      requireConfiguration(credentials, timeoutMs);
      if (!CALLBACK_INPUT.test(code) || !PKCE_VERIFIER.test(verifier)) {
        throw new AppError("OAUTH_CALLBACK_INVALID", "OAuth callback is invalid", 400);
      }

      const tokenPayload = await fetchJson(
        "token_exchange",
        OAUTH_TOKEN_URL,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: new URLSearchParams({
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            code,
            redirect_uri: APP_CONFIG.githubOAuthCallbackUrl,
            code_verifier: verifier,
          }),
        },
        APP_CONFIG.githubOAuthTokenResponseMaxBytes,
        dependencies,
        timeoutMs,
      );
      const accessToken = readAccessToken(tokenPayload);
      if (!accessToken) {
        reportUpstreamFailure(dependencies, { stage: "token_exchange", reason: "payload" });
        throw oauthUnavailable();
      }

      const apiHeaders = {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${accessToken}`,
        "user-agent": APP_CONFIG.githubOAuthUserAgent,
        "x-github-api-version": APP_CONFIG.githubApiVersion,
      };
      const userPayload = await fetchJson(
        "user_fetch",
        GITHUB_USER_URL,
        { method: "GET", headers: apiHeaders },
        APP_CONFIG.githubOAuthUserResponseMaxBytes,
        dependencies,
        timeoutMs,
      );
      const emailsPayload = await fetchJson(
        "email_fetch",
        GITHUB_EMAILS_URL,
        { method: "GET", headers: apiHeaders },
        APP_CONFIG.githubOAuthEmailsResponseMaxBytes,
        dependencies,
        timeoutMs,
      );

      return extractIdentity(userPayload, emailsPayload);
    },
  };
}

function requireConfiguration(credentials: GitHubOAuthCredentials, timeoutMs: number): void {
  const validCredential = (value: unknown, maxBytes: number) => (
    typeof value === "string"
    && value.length > 0
    && value.length <= maxBytes
    && /^[\x21-\x7e]+$/.test(value)
  );
  if (!validCredential(credentials.clientId, 256)
    || !validCredential(credentials.clientSecret, 1024)
    || !Number.isSafeInteger(timeoutMs)
    || timeoutMs <= 0
    || timeoutMs > 60_000) {
    throw new AppError("OAUTH_CONFIG_INVALID", "GitHub authentication is not configured", 503);
  }
}

async function fetchJson(
  stage: GitHubOAuthStage,
  expectedUrl: string,
  init: RequestInit,
  maxBytes: number,
  dependencies: GitHubOAuthDependencies,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const startedAt = dependencies.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let reported = false;
  const fail = (reason: GitHubOAuthFailureReason, httpStatus?: number): never => {
    reportUpstreamFailure(dependencies, { stage, reason, ...(httpStatus === undefined ? {} : { httpStatus }) });
    reported = true;
    throw oauthUnavailable();
  };
  try {
    const response = await dependencies.fetch(expectedUrl, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });
    if (dependencies.now() - startedAt > timeoutMs) fail("timeout");
    if (response.redirected) fail("redirect", response.status);
    if (response.url !== ""
      && (response.url !== expectedUrl || new URL(response.url).protocol !== "https:")) {
      fail("url", response.status);
    }
    if (!response.ok) fail("status", response.status);
    if (!isJsonContentType(response.headers.get("content-type"))) fail("content_type", response.status);
    try {
      const text = await readBoundedText(response, maxBytes);
      return JSON.parse(text) as unknown;
    } catch {
      return fail(controller.signal.aborted ? "timeout" : "payload", response.status);
    }
  } catch {
    if (!reported) fail(controller.signal.aborted ? "timeout" : "network");
    throw oauthUnavailable();
  } finally {
    clearTimeout(timer);
  }
}

function reportUpstreamFailure(dependencies: GitHubOAuthDependencies, diagnostic: GitHubOAuthDiagnostic): void {
  try {
    dependencies.onUpstreamFailure?.(diagnostic);
  } catch {
    // Diagnostics must never change the stable OAuth failure response.
  }
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    throw oauthUnavailable();
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw oauthUnavailable();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function extractIdentity(userPayload: unknown, emailsPayload: unknown): GitHubIdentity {
  if (!isRecord(userPayload)
    || typeof userPayload.id !== "number"
    || !Number.isSafeInteger(userPayload.id)
    || userPayload.id <= 0
    || !Array.isArray(emailsPayload)
    || emailsPayload.length > 100) {
    throw identityInvalid();
  }

  const candidates = emailsPayload.filter((entry) => (
    isRecord(entry) && entry.primary === true && entry.verified === true
  ));
  if (candidates.length !== 1) throw identityInvalid();
  const emailValue = candidates[0]?.email;
  if (typeof emailValue !== "string") throw identityInvalid();
  const email = canonicalEmail(emailValue);
  if (!email) throw identityInvalid();

  const githubUserId = String(userPayload.id);
  return { subject: `github:${githubUserId}`, githubUserId, email };
}

function readAccessToken(payload: unknown): string | undefined {
  if (!isRecord(payload) || typeof payload.access_token !== "string" || !ACCESS_TOKEN.test(payload.access_token)) {
    return undefined;
  }
  return payload.access_token;
}

function isJsonContentType(value: string | null): boolean {
  const mediaType = value?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function randomBase64Url(randomBytes: (length: number) => Uint8Array, length: number): string {
  const bytes = randomBytes(length);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== length) throw oauthUnavailable();
  return base64Url(bytes);
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function oauthUnavailable(): AppError {
  return new AppError(
    "OAUTH_UPSTREAM_UNAVAILABLE",
    "GitHub authentication is temporarily unavailable",
    503,
    true,
  );
}

function identityInvalid(): AppError {
  return new AppError("OAUTH_IDENTITY_INVALID", "GitHub identity is invalid", 401);
}
