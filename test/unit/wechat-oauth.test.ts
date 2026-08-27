import { afterEach, describe, expect, it, vi } from "vitest";
import { createWeChatOAuthClient } from "../../src/identity/wechat-oauth";

describe("WeChat website QR OAuth", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports whether the provider is configured without exposing credentials", () => {
    expect(createWeChatOAuthClient({ appId: "", appSecret: "" }).isConfigured()).toBe(false);
    expect(createWeChatOAuthClient({ appId: "wx-app", appSecret: "wx-secret" }).isConfigured()).toBe(true);
  });

  it("builds the official QR authorization URL with state", async () => {
    const start = await createWeChatOAuthClient({ appId: "wx-app", appSecret: "wx-secret" }).createStart();
    const url = new URL(start.authorizationUrl);
    expect(url.origin + url.pathname).toBe("https://open.weixin.qq.com/connect/qrconnect");
    expect(url.searchParams.get("appid")).toBe("wx-app");
    expect(url.searchParams.get("scope")).toBe("snsapi_login");
    expect(url.searchParams.get("redirect_uri")).toBe("https://memory.crgmhrc.asia/auth/wechat/callback");
    expect(url.searchParams.get("state")).toBe(start.state);
  });

  it("exchanges a one-time code for a stable unionid subject", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "token", openid: "open-id", unionid: "union-id" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(createWeChatOAuthClient({ appId: "wx-app", appSecret: "wx-secret" }).resolveCallback("code-1")).resolves.toMatchObject({ subject: "wechat:union-id", openId: "open-id", unionId: "union-id" });
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "manual" }));
  });

  it("fails closed when credentials or the provider response is invalid", async () => {
    await expect(createWeChatOAuthClient({ appId: "", appSecret: "" }).createStart()).rejects.toMatchObject({ code: "WECHAT_OAUTH_CONFIG_INVALID", status: 503 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ errcode: 40029 }), { status: 200 })));
    await expect(createWeChatOAuthClient({ appId: "wx-app", appSecret: "wx-secret" }).resolveCallback("code-1")).rejects.toMatchObject({ code: "WECHAT_OAUTH_UNAVAILABLE", status: 503 });
  });
});
