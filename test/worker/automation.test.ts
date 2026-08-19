/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { AutomationAuthenticator } from "../../src/identity/automation";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const NONCE = "AAECAwQFBgcICQoLDA0ODw";
const BODY = new TextEncoder().encode('{"title":"雪","content":"🌱"}');
const SIGNATURE = "ec80117ecbd841e3b168f3b727372ca04ec2963ab77eddd90f3e20db55efde9c";

describe("automation nonce claims in D1", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
  });

  it("accepts a fixed signed request once and returns a stable replay rejection", async () => {
    const fixture = automationFixture();

    await expect(fixture.authenticator.verify(signedRequest(), BODY.byteLength)).resolves.toMatchObject({
      bodyBytes: BODY,
    });
    await expect(fixture.authenticator.verify(signedRequest(), BODY.byteLength)).rejects.toMatchObject({
      code: "AUTOMATION_REPLAY",
      message: "Automation request was already used",
      status: 409,
    });

    expect(await nonceRows()).toEqual([{
      client_id: env.AUTOMATION_CLIENT_ID,
      nonce: NONCE,
      expires_at: "2026-08-19T12:05:01.000Z",
    }]);
    expect(fixture.scheduled).toHaveLength(1);
    await Promise.all(fixture.scheduled);
  });

  it("does not consume a nonce for an invalid signature and permits the later valid request", async () => {
    const fixture = automationFixture();

    await expect(fixture.authenticator.verify(signedRequest("0".repeat(64)), BODY.byteLength))
      .rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 });
    await expect(nonceRows()).resolves.toEqual([]);
    expect(fixture.scheduled).toEqual([]);

    await expect(fixture.authenticator.verify(signedRequest(), BODY.byteLength)).resolves.toBeDefined();
    await expect(nonceRows()).resolves.toHaveLength(1);
    await Promise.all(fixture.scheduled);
  });

  it("bounds best-effort expiry cleanup to fifty rows", async () => {
    const expiredAt = "2026-08-19T11:59:59.000Z";
    for (let index = 0; index < 55; index += 1) {
      await env.DB.prepare(
        "INSERT INTO automation_nonces (client_id, nonce, expires_at) VALUES (?, ?, ?)",
      ).bind("expired-client", `expired-${String(index).padStart(2, "0")}`, expiredAt).run();
    }
    const fixture = automationFixture();

    await fixture.authenticator.verify(signedRequest(), BODY.byteLength);
    expect(fixture.scheduled).toHaveLength(1);
    await Promise.all(fixture.scheduled);

    const expired = await env.DB.prepare(
      "SELECT nonce FROM automation_nonces WHERE expires_at <= ? ORDER BY nonce",
    ).bind(NOW.toISOString()).all<{ nonce: string }>();
    expect(expired.results).toHaveLength(5);
  });

  it("allows exactly one winner for parallel requests with the same valid nonce", async () => {
    const fixture = automationFixture();

    const results = await Promise.allSettled([
      fixture.authenticator.verify(signedRequest(), BODY.byteLength),
      fixture.authenticator.verify(signedRequest(), BODY.byteLength),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: "AUTOMATION_REPLAY", status: 409 });
    await expect(nonceRows()).resolves.toHaveLength(1);
    expect(fixture.scheduled).toHaveLength(1);
    await Promise.all(fixture.scheduled);
  });
});

function automationFixture() {
  const scheduled: Promise<unknown>[] = [];
  const authenticator = new AutomationAuthenticator(env.DB, env, {
    now: () => new Date(NOW),
    waitUntil: (promise) => { scheduled.push(promise); },
  });
  return { authenticator, scheduled };
}

function signedRequest(signature = SIGNATURE): Request {
  return new Request("https://memory.crgmhrc.asia/api/notes?z=last&a=first", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-automation-id": env.AUTOMATION_CLIENT_ID,
      "x-automation-timestamp": "1787140800",
      "x-automation-nonce": NONCE,
      "x-automation-signature": signature,
      authorization: `Bearer ${env.APP_TOKEN}`,
    },
    body: BODY,
  });
}

async function nonceRows() {
  const result = await env.DB.prepare(
    "SELECT client_id, nonce, expires_at FROM automation_nonces ORDER BY client_id, nonce",
  ).all<{ client_id: string; nonce: string; expires_at: string }>();
  return result.results;
}
