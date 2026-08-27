import { APP_CONFIG } from "../config";
import { AppError } from "../http";

const AUTHORIZE_URL = "https://open.weixin.qq.com/connect/qrconnect";
const TOKEN_URL = "https://api.weixin.qq.com/sns/oauth2/access_token";
const CODE = /^[A-Za-z0-9._~-]{1,512}$/u;
const SUBJECT_PART = /^[A-Za-z0-9_-]{2,128}$/u;

export interface WeChatIdentity {
  subject: `wechat:${string}`;
  openId: string;
  unionId?: string;
}

export interface WeChatOAuthStart {
  authorizationUrl: string;
  state: string;
}

export interface WeChatOAuthClient {
  isConfigured(): boolean;
  createStart(): Promise<WeChatOAuthStart>;
  resolveCallback(code: string): Promise<WeChatIdentity>;
}

export interface WeChatOAuthCredentials {
  appId: string;
  appSecret: string;
}

export function createWeChatOAuthClient(credentials: WeChatOAuthCredentials): WeChatOAuthClient {
  return {
    isConfigured(): boolean {
      return hasValidConfiguration(credentials);
    },

    async createStart(): Promise<WeChatOAuthStart> {
      requireConfiguration(credentials);
      const state = randomBase64Url(32);
      const url = new URL(AUTHORIZE_URL);
      url.search = new URLSearchParams({
        appid: credentials.appId,
        redirect_uri: `${APP_CONFIG.canonicalOrigin}/auth/wechat/callback`,
        response_type: "code",
        scope: "snsapi_login",
        state,
      }).toString();
      url.hash = "wechat_redirect";
      return { authorizationUrl: url.toString(), state };
    },

    async resolveCallback(code: string): Promise<WeChatIdentity> {
      requireConfiguration(credentials);
      if (!CODE.test(code)) throw new AppError("OAUTH_CALLBACK_INVALID", "OAuth callback is invalid", 400);
      const url = new URL(TOKEN_URL);
      url.search = new URLSearchParams({
        appid: credentials.appId,
        secret: credentials.appSecret,
        code,
        grant_type: "authorization_code",
      }).toString();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), APP_CONFIG.githubOAuthTimeoutMs);
      const response = await fetch(url, { redirect: "manual", signal: controller.signal, headers: { accept: "application/json" } }).catch(() => undefined);
      clearTimeout(timer);
      if (!response || !response.ok || response.redirected) throw unavailable();
      let payload: unknown;
      try { payload = await response.json(); } catch { throw unavailable(); }
      if (!isRecord(payload) || typeof payload.openid !== "string" || !SUBJECT_PART.test(payload.openid)) throw unavailable();
      const unionId = typeof payload.unionid === "string" && SUBJECT_PART.test(payload.unionid) ? payload.unionid : undefined;
      const subjectPart = unionId || payload.openid;
      return { subject: `wechat:${subjectPart}`, openId: payload.openid, ...(unionId ? { unionId } : {}) };
    },
  };
}

function requireConfiguration(credentials: WeChatOAuthCredentials): void {
  if (!hasValidConfiguration(credentials)) {
    throw new AppError("WECHAT_OAUTH_CONFIG_INVALID", "WeChat authentication is not configured", 503);
  }
}

function hasValidConfiguration(credentials: WeChatOAuthCredentials): boolean {
  const valid = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max && /^[\x21-\x7e]+$/u.test(value);
  return valid(credentials.appId, 256) && valid(credentials.appSecret, 1024);
}

function unavailable(): AppError { return new AppError("WECHAT_OAUTH_UNAVAILABLE", "WeChat authentication is temporarily unavailable", 503, true); }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function randomBase64Url(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
