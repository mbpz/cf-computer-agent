import { describe, expect, it, vi } from "vitest";
import { fixedLengthBytesEqual } from "../../src/auth";
import {
  AutomationAuthenticator,
  requestFromVerifiedBytes,
  type AutomationAuthenticatorOptions,
  type AutomationEnvironment,
} from "../../src/identity/automation";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const CLIENT_ID = "automation-client-for-fixed-vectors";
const AUTOMATION_SECRET = "automation-secret-for-fixed-vectors";
const APP_TOKEN = "app-token-for-fixed-vectors";
const NONCE = "AAECAwQFBgcICQoLDA0ODw";
const RAW_NONCE = "EBESExQVFhcYGRobHB0eHw";
const MAX_NONCE = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0-Pw";
const EMPTY_SIGNATURE = "12e547adcb5c3ae1dd5353c31d7d99488cfc1e50d0583caa822c4002000160fd";
const MINUS_300_SIGNATURE = "138187ad40ea5946d8b0576023bbd9f44ed625e79f050bfb84f99957f7882f6e";
const PLUS_300_SIGNATURE = "7399f7ebb9fa4b5b2c66dae1825e07805835e24be205e2deaf511c437784879c";
const RAW_SIGNATURE = "c14c39912661fbb38c3dab0296c772addc345701bfec44a40aa111997dcfcd85";
const MAX_NONCE_SIGNATURE = "de39c247fc7f9782f5237ce194c4e17b42d3e71c0c2cdcd74c0d4dc29e5d7dc9";
const RAW_BODY = new Uint8Array([0, 255, 195, 40, 226, 130, 172]);

describe("AutomationAuthenticator canonicalization and cryptography", () => {
  it("accepts the fixed empty-body SHA-256 vector and preserves path/query ordering", async () => {
    const fixture = automationFixture();

    const verified = await fixture.authenticator.verify(fixedRequest(), 0);

    expect([...verified.bodyBytes]).toEqual([]);
    expect(fixture.db.claims).toEqual([{
      clientId: CLIENT_ID,
      nonce: NONCE,
      expiresAt: "2026-08-19T12:05:01.000Z",
    }]);

    await expect(fixture.authenticator.verify(fixedRequest({
      url: "https://memory.crgmhrc.asia/api/health?a=first&a=second&z=last",
    }), 0)).rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 });
    expect(fixture.db.claims).toHaveLength(1);
  });

  it("hashes non-ASCII raw bytes exactly once and reconstructs a request over those exact bytes", async () => {
    const fixture = automationFixture();
    const request = fixedRequest({
      url: "https://memory.crgmhrc.asia/api/notes?z=%E9%9B%AA&a=first&a=second",
      method: "POST",
      body: RAW_BODY,
      nonce: RAW_NONCE,
      signature: RAW_SIGNATURE,
    });

    const verified = await fixture.authenticator.verify(request, RAW_BODY.byteLength);
    const reconstructed = requestFromVerifiedBytes(request, verified.bodyBytes);

    expect(request.bodyUsed).toBe(true);
    expect(reconstructed.url).toBe(request.url);
    expect(reconstructed.method).toBe("POST");
    expect(reconstructed.headers.get("x-automation-nonce")).toBe(RAW_NONCE);
    expect([...new Uint8Array(await reconstructed.arrayBuffer())]).toEqual([...RAW_BODY]);
    expect(fixture.db.claims).toEqual([{
      clientId: CLIENT_ID,
      nonce: RAW_NONCE,
      expiresAt: "2026-08-19T12:05:01.000Z",
    }]);
  });

  it("accepts fixed signatures at exactly minus and plus 300 seconds of skew", async () => {
    for (const vector of [
      { timestamp: "1787140500", signature: MINUS_300_SIGNATURE },
      { timestamp: "1787141100", signature: PLUS_300_SIGNATURE },
    ]) {
      const fixture = automationFixture();
      await expect(fixture.authenticator.verify(fixedRequest(vector), 0)).resolves.toMatchObject({
        bodyBytes: new Uint8Array(),
      });
      expect(fixture.db.claims).toHaveLength(1);
    }
  });

  it("enforces both timestamp boundaries against exact server milliseconds", async () => {
    for (const vector of [
      {
        now: new Date(NOW.getTime() + 1),
        timestamp: "1787140500",
        signature: MINUS_300_SIGNATURE,
      },
      {
        now: new Date(NOW.getTime() - 1),
        timestamp: "1787141100",
        signature: PLUS_300_SIGNATURE,
      },
    ]) {
      const fixture = automationFixture({ now: () => vector.now });
      await expect(fixture.authenticator.verify(fixedRequest(vector), 0)).rejects.toMatchObject({
        code: "AUTH_REQUIRED", status: 401,
      });
      expect(fixture.db.claims).toEqual([]);
    }

    for (const vector of [
      {
        now: new Date(NOW.getTime() - 1),
        timestamp: "1787140500",
        signature: MINUS_300_SIGNATURE,
      },
      {
        now: new Date(NOW.getTime() + 1),
        timestamp: "1787141100",
        signature: PLUS_300_SIGNATURE,
      },
    ]) {
      const fixture = automationFixture({ now: () => vector.now });
      await expect(fixture.authenticator.verify(fixedRequest(vector), 0)).resolves.toBeDefined();
      expect(fixture.db.claims).toHaveLength(1);
    }
  });

  it("retains a future-skew nonce through its final accepted server second", async () => {
    const fixture = automationFixture();

    await fixture.authenticator.verify(fixedRequest({
      timestamp: "1787141100",
      signature: PLUS_300_SIGNATURE,
    }), 0);

    expect(fixture.db.claims).toEqual([{
      clientId: CLIENT_ID,
      nonce: NONCE,
      expiresAt: "2026-08-19T12:10:01.000Z",
    }]);
  });

  it("retains a nonce from the exact fractional claim time without truncating milliseconds", async () => {
    const claimTime = new Date(NOW.getTime() + 500);
    const fixture = automationFixture({ now: () => claimTime });

    await fixture.authenticator.verify(fixedRequest(), 0);

    expect(fixture.db.claims).toEqual([{
      clientId: CLIENT_ID,
      nonce: NONCE,
      expiresAt: "2026-08-19T12:05:01.500Z",
    }]);
  });

  it("rejects otherwise-valid fixed signatures beyond either timestamp boundary", async () => {
    const late = automationFixture({ now: () => new Date(NOW.getTime() + 1_000) });
    await expect(late.authenticator.verify(fixedRequest({
      timestamp: "1787140500",
      signature: MINUS_300_SIGNATURE,
    }), 0)).rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 });

    const early = automationFixture({ now: () => new Date(NOW.getTime() - 1_000) });
    await expect(early.authenticator.verify(fixedRequest({
      timestamp: "1787141100",
      signature: PLUS_300_SIGNATURE,
    }), 0)).rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 });

    expect(late.db.claims).toEqual([]);
    expect(early.db.claims).toEqual([]);
  });

  it("revalidates timestamp skew after body hashing and APP token verification before claiming", async () => {
    let clockReads = 0;
    const fixture = automationFixture({
      now: () => new Date(NOW.getTime() + (clockReads++ === 0 ? 0 : 301_000)),
    });

    await expect(fixture.authenticator.verify(fixedRequest(), 0)).rejects.toMatchObject({
      code: "AUTH_REQUIRED", status: 401,
    });
    expect(clockReads).toBe(2);
    expect(fixture.db.claims).toEqual([]);
    expect(fixture.scheduled).toEqual([]);
  });

  it("accepts canonical nonces at the exact 16-byte and 64-byte boundaries", async () => {
    for (const vector of [
      { nonce: NONCE, signature: EMPTY_SIGNATURE },
      { nonce: MAX_NONCE, signature: MAX_NONCE_SIGNATURE },
    ]) {
      const fixture = automationFixture();
      await expect(fixture.authenticator.verify(fixedRequest(vector), 0)).resolves.toBeDefined();
      expect(fixture.db.claims.map((claim) => claim.nonce)).toEqual([vector.nonce]);
    }
  });

  it.each([
    { bytes: 15, nonce: "A".repeat(20) },
    { bytes: 65, nonce: "A".repeat(87) },
  ])("rejects a canonical $bytes-byte nonce before invoking the base64 decoder", async ({ nonce }) => {
    const decoder = vi.spyOn(globalThis, "atob");
    const fixture = automationFixture();
    try {
      await expect(fixture.authenticator.verify(fixedRequest({ nonce }), 0)).rejects.toMatchObject({
        code: "AUTH_REQUIRED", status: 401,
      });
      expect(decoder).not.toHaveBeenCalled();
      expect(fixture.db.claims).toEqual([]);
    } finally {
      decoder.mockRestore();
    }
  });

  it.each([
    EMPTY_SIGNATURE.toUpperCase(),
    EMPTY_SIGNATURE.slice(0, -2),
    `${EMPTY_SIGNATURE.slice(0, -1)}g`,
  ])("rejects a signature that is not exactly 64 lower-case hexadecimal characters: %s", async (signature) => {
    const fixture = automationFixture();
    await expect(fixture.authenticator.verify(fixedRequest({ signature }), 0)).rejects.toMatchObject({
      code: "AUTH_REQUIRED", status: 401,
    });
    expect(fixture.db.claims).toEqual([]);
  });

  it.each([
    "AA",
    `${NONCE}=`,
    `${NONCE.slice(0, -1)}x`,
    "not_base64url!*",
  ])("rejects an unbounded or noncanonical nonce: %s", async (nonce) => {
    const fixture = automationFixture();
    await expect(fixture.authenticator.verify(fixedRequest({ nonce }), 0)).rejects.toMatchObject({
      code: "AUTH_REQUIRED", status: 401,
    });
    expect(fixture.db.claims).toEqual([]);
  });

  it("rejects a wrong automation ID, HMAC, or APP token before claiming the nonce", async () => {
    const cases = [
      fixedRequest({ clientId: "wrong-client" }),
      fixedRequest({ signature: "0".repeat(64) }),
      fixedRequest({ appToken: "wrong-app-token" }),
    ];

    for (const request of cases) {
      const fixture = automationFixture();
      await expect(fixture.authenticator.verify(request, 0)).rejects.toMatchObject({
        code: "AUTH_REQUIRED", status: 401,
      });
      expect(fixture.db.claims).toEqual([]);
    }
  });

  it.each([
    "x-automation-id",
    "x-automation-timestamp",
    "x-automation-nonce",
    "x-automation-signature",
    "authorization",
  ])("fails closed when the %s factor is missing", async (missingHeader) => {
    const fixture = automationFixture();
    const request = fixedRequest();
    request.headers.delete(missingHeader);

    await expect(fixture.authenticator.verify(request, 0)).rejects.toMatchObject({
      code: "AUTH_REQUIRED", status: 401,
    });
    expect(fixture.db.claims).toEqual([]);
  });

  it("fails closed without configured automation secrets", async () => {
    for (const missing of ["AUTOMATION_CLIENT_ID", "AUTOMATION_SECRET", "APP_TOKEN"] as const) {
      const environment: AutomationEnvironment = {
        AUTOMATION_CLIENT_ID: CLIENT_ID,
        AUTOMATION_SECRET,
        APP_TOKEN,
      };
      delete environment[missing];
      const fixture = automationFixture({}, environment);

      await expect(fixture.authenticator.verify(fixedRequest(), 0)).rejects.toMatchObject({
        code: "AUTH_MISCONFIGURED", status: 503,
      });
      expect(fixture.db.claims).toEqual([]);
    }
  });

  it("enforces the transport byte cap before any nonce claim", async () => {
    const fixture = automationFixture();
    await expect(fixture.authenticator.verify(fixedRequest({
      url: "https://memory.crgmhrc.asia/api/notes?z=%E9%9B%AA&a=first&a=second",
      method: "POST",
      body: RAW_BODY,
      nonce: RAW_NONCE,
      signature: RAW_SIGNATURE,
    }), RAW_BODY.byteLength - 1)).rejects.toMatchObject({
      code: "REQUEST_TOO_LARGE", status: 413,
    });
    expect(fixture.db.claims).toEqual([]);
  });
});

describe("fixedLengthBytesEqual", () => {
  it("compares every byte only when decoded lengths are identical", () => {
    const expected = Uint8Array.from({ length: 32 }, (_value, index) => index);
    const different = Uint8Array.from(expected);
    different[31] = 0;

    expect(fixedLengthBytesEqual(expected, Uint8Array.from(expected))).toBe(true);
    expect(fixedLengthBytesEqual(expected, different)).toBe(false);
    expect(fixedLengthBytesEqual(expected, expected.slice(0, 31))).toBe(false);
    expect(fixedLengthBytesEqual(expected, Uint8Array.from([...expected, 0]))).toBe(false);
  });
});

function automationFixture(
  options: Partial<AutomationAuthenticatorOptions> = {},
  environment: AutomationEnvironment = {
    AUTOMATION_CLIENT_ID: CLIENT_ID,
    AUTOMATION_SECRET,
    APP_TOKEN,
  },
) {
  const db = new FakeD1();
  const scheduled: Promise<unknown>[] = [];
  const authenticator = new AutomationAuthenticator(db.database, environment, {
    now: () => new Date(NOW),
    waitUntil: (promise) => { scheduled.push(promise); },
    ...options,
  });
  return { authenticator, db, scheduled };
}

interface FixedRequestOptions {
  url?: string;
  method?: string;
  body?: Uint8Array<ArrayBuffer>;
  clientId?: string;
  timestamp?: string;
  nonce?: string;
  signature?: string;
  appToken?: string;
}

function fixedRequest(options: FixedRequestOptions = {}): Request {
  const method = options.method || "GET";
  return new Request(
    options.url || "https://memory.crgmhrc.asia/api/health?z=last&a=first&a=second",
    {
      method,
      headers: {
        "x-automation-id": options.clientId || CLIENT_ID,
        "x-automation-timestamp": options.timestamp || "1787140800",
        "x-automation-nonce": options.nonce || NONCE,
        "x-automation-signature": options.signature || EMPTY_SIGNATURE,
        authorization: `Bearer ${options.appToken || APP_TOKEN}`,
      },
      ...(options.body ? { body: options.body } : {}),
    },
  );
}

interface FakeNonceClaim {
  clientId: string;
  nonce: string;
  expiresAt: string;
}

class FakeD1 {
  readonly claims: FakeNonceClaim[] = [];
  cleanupRuns = 0;

  get database(): D1Database {
    return this as unknown as D1Database;
  }

  prepare(query: string): D1PreparedStatement {
    return new FakeStatement(this, query) as unknown as D1PreparedStatement;
  }

  async run<T>(query: string, bindings: unknown[]): Promise<D1Result<T>> {
    const sql = query.replace(/\s+/gu, " ").trim().toUpperCase();
    if (sql.startsWith("INSERT INTO AUTOMATION_NONCES")) {
      const key = `${String(bindings[0])}\n${String(bindings[1])}`;
      if (this.claims.some((claim) => `${claim.clientId}\n${claim.nonce}` === key)) {
        return { meta: { changes: 0 } } as D1Result<T>;
      }
      this.claims.push({
        clientId: String(bindings[0]),
        nonce: String(bindings[1]),
        expiresAt: String(bindings[2]),
      });
      return { meta: { changes: 1 } } as D1Result<T>;
    }
    if (sql.startsWith("DELETE FROM AUTOMATION_NONCES") && sql.includes("LIMIT 50")) {
      this.cleanupRuns += 1;
      return { meta: { changes: 0 } } as D1Result<T>;
    }
    throw new Error(`Unexpected D1 query: ${sql}`);
  }
}

class FakeStatement {
  private bindings: unknown[] = [];

  constructor(private readonly db: FakeD1, private readonly query: string) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.bindings = values;
    return this as unknown as D1PreparedStatement;
  }

  run<T = unknown>(): Promise<D1Result<T>> {
    return this.db.run<T>(this.query, this.bindings);
  }
}
