// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createEmailLoginMailer } from "../../src/email-login/mailer";

const MESSAGE = { to: "user@example.test", code: "123456", expiresAt: "2026-10-18T10:10:00.000Z" };

function capturingBinding(fail = false) {
  const sent: EmailMessageBuilder[] = [];
  const binding = {
    async send(message: EmailMessageBuilder) {
      if (fail) throw new Error("provider detail");
      sent.push(message);
      return { messageId: "sent" } as EmailSendResult;
    },
  } as unknown as SendEmail;
  return { sent, binding };
}

describe("email login mailer", () => {
  it("stays unavailable without the Email Sending binding", () => {
    expect(createEmailLoginMailer({})).toBeUndefined();
  });

  it("sends through the binding with the configured sender and code", async () => {
    const { sent, binding } = capturingBinding();
    const mailer = createEmailLoginMailer({ EMAIL: binding }, "login@example.test");
    await mailer!.send(MESSAGE);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      from: { email: "login@example.test", name: "Memory Garden" },
      to: "user@example.test",
      subject: "Memory Garden sign-in code / 登录验证码",
    });
    expect(sent[0].text).toContain("123456");
    expect(sent[0].text).toContain("10 minutes");
    expect(sent[0].html).toContain("123456");
    expect(JSON.stringify(sent[0].from)).not.toContain("123456");
  });

  it("propagates a provider failure for the service to translate", async () => {
    const { binding } = capturingBinding(true);
    const mailer = createEmailLoginMailer({ EMAIL: binding }, "login@example.test");
    await expect(mailer!.send(MESSAGE)).rejects.toThrow("provider detail");
  });
});
