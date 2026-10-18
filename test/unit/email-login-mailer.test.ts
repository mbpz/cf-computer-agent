// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createEmailLoginMailer } from "../../src/email-login/mailer";

const MESSAGE = { to: "user@example.test", code: "123456", expiresAt: "2026-10-18T10:10:00.000Z" };

function capturingFetch(response: Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return response;
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("email login mailer", () => {
  it("stays unavailable without the Resend API key", () => {
    const { fetchImpl } = capturingFetch(new Response(null, { status: 200 }));
    expect(createEmailLoginMailer({}, fetchImpl, "login@example.test")).toBeUndefined();
  });

  it("posts the exact Resend body with the fixed sender and code", async () => {
    const { calls, fetchImpl } = capturingFetch(new Response(JSON.stringify({ id: "sent" }), { status: 200 }));
    const mailer = createEmailLoginMailer({ RESEND_API_KEY: "re_test" }, fetchImpl, "login@example.test");
    await mailer!.send(MESSAGE);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(new Headers(calls[0]!.init?.headers).get("authorization")).toBe("Bearer re_test");
    const body = JSON.parse(String(calls[0]!.init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      from: "Memory Garden <login@example.test>",
      to: ["user@example.test"],
      subject: "Memory Garden sign-in code / 登录验证码",
    });
    expect(body.text).toContain("123456");
    expect(body.text).toContain("10 minutes");
    expect(body.html).toContain("123456");
    expect(JSON.stringify(calls[0]!.init?.headers)).not.toContain("123456");
  });

  it("classifies an unusable key or sender as a configuration error", async () => {
    const { fetchImpl } = capturingFetch(new Response("provider detail", { status: 403 }));
    const mailer = createEmailLoginMailer({ RESEND_API_KEY: "re_test" }, fetchImpl, "login@example.test");
    await expect(mailer!.send(MESSAGE)).rejects.toMatchObject({
      code: "EMAIL_SENDER_NOT_VERIFIED",
      retryable: false,
    });
  });

  it("classifies a provider outage as retryable and never leaks the body", async () => {
    const { fetchImpl } = capturingFetch(new Response("provider detail", { status: 503 }));
    const mailer = createEmailLoginMailer({ RESEND_API_KEY: "re_test" }, fetchImpl, "login@example.test");
    await expect(mailer!.send(MESSAGE)).rejects.toMatchObject({
      code: "EMAIL_DELIVERY_REJECTED",
      retryable: true,
    });
  });
});
