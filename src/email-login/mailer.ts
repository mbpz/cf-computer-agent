import { APP_CONFIG } from "../config";
import { EMAIL_LOGIN_CODE_TTL_MS, type EmailLoginMailer } from "./types";

export interface EmailLoginMailerEnvironment {
  EMAIL?: SendEmail;
}

/**
 * Cloudflare Email Sending binding. The sender is a code-owned constant on the
 * canonical domain, so enabling email sign-in needs no new environment variable:
 * only the `send_email` binding and domain onboarding in Cloudflare.
 */
export function createEmailLoginMailer(
  environment: EmailLoginMailerEnvironment,
  from: string = APP_CONFIG.emailLoginFrom,
): EmailLoginMailer | undefined {
  const binding = environment.EMAIL;
  if (!binding) return undefined;

  return {
    async send({ to, code, expiresAt }) {
      const expiresMinutes = Math.max(1, Math.round(EMAIL_LOGIN_CODE_TTL_MS / 60_000));
      await binding.send({
        from: { email: from, name: "Memory Garden" },
        to,
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
      });
    },
  };
}
