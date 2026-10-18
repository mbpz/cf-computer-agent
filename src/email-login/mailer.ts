import { APP_CONFIG } from "../config";
import { EMAIL_LOGIN_CODE_TTL_MS, type EmailLoginMailer } from "./types";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 5_000;

export interface EmailLoginMailerEnvironment {
  RESEND_API_KEY?: string;
}

/**
 * Resend HTTP transport. Cloudflare Email Sending is not available on this
 * account, so the only new deployment value is one `RESEND_API_KEY` secret;
 * the sender stays a code-owned constant on the canonical domain and the HMAC
 * pepper reuses `APP_TOKEN`.
 */
export function createEmailLoginMailer(
  environment: EmailLoginMailerEnvironment,
  fetchImpl: typeof fetch = fetch,
  from: string = APP_CONFIG.emailLoginFrom,
): EmailLoginMailer | undefined {
  const apiKey = environment.RESEND_API_KEY;
  if (!apiKey) return undefined;

  return {
    async send({ to, code, expiresAt }) {
      const expiresMinutes = Math.max(1, Math.round(EMAIL_LOGIN_CODE_TTL_MS / 60_000));
      const response = await fetchImpl(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: `Memory Garden <${from}>`,
          to: [to],
          subject: "Memory Garden sign-in code / 登录验证码",
          text: [
            `Memory Garden sign-in code: ${code}`,
            `This code expires in ${expiresMinutes} minutes and can be used once.`,
            `Expires at ${expiresAt}. If you did not request it, ignore this email.`,
            "",
            `Memory Garden 登录验证码：${code}`,
            `验证码 ${expiresMinutes} 分钟内有效，仅可使用一次。`,
            "若非本人操作，请忽略此邮件。",
          ].join("\n"),
          html: `<p>Memory Garden sign-in code: <strong style="font-size:20px;letter-spacing:2px">${code}</strong></p>
<p>This code expires in ${expiresMinutes} minutes and can be used once. If you did not request it, ignore this email.</p>
<hr />
<p>Memory Garden 登录验证码：<strong style="font-size:20px;letter-spacing:2px">${code}</strong></p>
<p>验证码 ${expiresMinutes} 分钟内有效，仅可使用一次。若非本人操作，请忽略此邮件。</p>`,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!response.ok) {
        // 401/403 means the API key or sender domain is not usable; other
        // failures are delivery outcomes. Never read or log the provider body.
        const unverified = response.status === 401 || response.status === 403;
        throw Object.assign(new Error("EMAIL_LOGIN_DELIVERY_FAILED"), {
          code: unverified ? "EMAIL_SENDER_NOT_VERIFIED" : "EMAIL_DELIVERY_REJECTED",
          retryable: response.status >= 500 || response.status === 429,
        });
      }
    },
  };
}
