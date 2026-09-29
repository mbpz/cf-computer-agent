import { describe, expect, it } from "vitest";
import { createConnectorAuthorizationSigner } from "../../src/environments/connector-signing";
import { createConnectorAuthorizationVerifier, type ConnectorAuthorizationBinding, type ConnectorAuthorizationClaims } from "../../shared/connector-authorization";

const binding: ConnectorAuthorizationBinding = {
  purpose: "connect", origin: "https://workbench.example.test", connectorId: "connector-1",
  memberId: "member-1", environmentId: "environment-1", runtimeId: "runtime-1",
  generation: 2, policyVersion: "policy-1", leaseId: null,
};
const claims = (): ConnectorAuthorizationClaims => ({ ...binding, version: 1, ticketId: "ticket-1", issuedAtMs: 100_000, expiresAtMs: 160_000 });
async function setup() {
  const pair = await crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"]) as CryptoKeyPair;
  return {
    pair,
    sign: createConnectorAuthorizationSigner({ keyId: "test-key", privateKey: pair.privateKey }),
    verify: createConnectorAuthorizationVerifier([{ keyId: "test-key", publicKey: pair.publicKey }]),
  };
}

// Runs in workerd, not a mocked signing adapter. Deleting sign, changing the
// algorithm, omitting a bound claim, or retaining a ticket after expiry fails.
describe("connector Ed25519 signing in Workers WebCrypto (not HTTP authority)", () => {
  it("signs deterministic, bound claims verified with only the public key", async () => {
    const { sign, verify, pair } = await setup();
    const ticket = await sign(claims(), binding, () => 110_000);
    expect(typeof ticket).toBe("string");
    expect(await sign(claims(), binding, () => 110_000)).toBe(ticket);
    expect(await verify(ticket, binding, () => 110_000)).toEqual(claims());
    const [h, p, s] = ticket!.split(".");
    const decode = (part: string) => atob(part.replace(/-/gu, "+").replace(/_/gu, "/"));
    expect(JSON.parse(decode(h))).toEqual({ alg: "EdDSA", typ: "memory-garden-connector+jws", kid: "test-key" });
    expect(JSON.parse(decode(p))).toEqual(claims());
    // Independent of the application verifier: exact signed input + raw crypto.
    expect(await crypto.subtle.verify("Ed25519", pair.publicKey,
      Uint8Array.from(decode(s), (c) => c.charCodeAt(0)), new TextEncoder().encode(`${h}.${p}`))).toBe(true);
  });

  it("fails closed when configuration is missing or has a public/wrong/invalid key", async () => {
    const { pair } = await setup();
    const wrong = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]) as CryptoKeyPair;
    const exportable = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) as CryptoKeyPair;
    for (const config of [undefined,
      { keyId: "test-key", privateKey: pair.publicKey },
      { keyId: "test-key", privateKey: wrong.privateKey },
      { keyId: "test-key", privateKey: exportable.privateKey },
      { keyId: "../invalid", privateKey: pair.privateKey },
    ]) expect(await createConnectorAuthorizationSigner(config)(claims(), binding, () => 110_000)).toBeUndefined();
  });

  it("does not sign claims which differ from the authoritative binding", async () => {
    const { sign } = await setup();
    for (const [key, value] of Object.entries({ memberId: "attacker", environmentId: "other", connectorId: "other", runtimeId: "other", origin: "https://other.test", generation: 3, policyVersion: "other" })) {
      expect(await sign({ ...claims(), [key]: value }, binding, () => 110_000)).toBeUndefined();
    }
  });

  it("does not sign malformed, expired, future or overlong claims", async () => {
    const { sign } = await setup();
    for (const invalid of [
      { ...claims(), version: 2 }, { ...claims(), memberId: undefined },
      { ...claims(), extra: true }, { ...claims(), issuedAtMs: 110_001 },
      { ...claims(), expiresAtMs: 110_000 }, { ...claims(), expiresAtMs: 160_001 },
    ]) expect(await sign(invalid, binding, () => 110_000)).toBeUndefined();
  });

  it("distinguishes connect tickets from renewal for a single lease", async () => {
    const { sign, verify } = await setup();
    const renewal = { ...binding, purpose: "renew" as const, leaseId: "lease-1" };
    const ticket = await sign({ ...claims(), ...renewal }, renewal, () => 110_000);
    expect(await verify(ticket, renewal, () => 110_000)).toMatchObject({ purpose: "renew", leaseId: "lease-1" });
    expect(await verify(ticket, binding, () => 110_000)).toBeUndefined();
    expect(await verify(ticket, { ...renewal, leaseId: "lease-2" }, () => 110_000)).toBeUndefined();
  });

  it("does not return a ticket that expired during signing", async () => {
    const { sign } = await setup();
    let now = 110_000;
    const pending = sign(claims(), binding, () => now);
    now = 160_000;
    expect(await pending).toBeUndefined();
  });

  it("snapshots configuration and claims before asynchronous signing", async () => {
    const { pair, verify } = await setup();
    const config = { keyId: "test-key", privateKey: pair.privateKey };
    const sign = createConnectorAuthorizationSigner(config);
    config.keyId = "changed";
    const input = claims();
    const expected = { ...binding };
    const pending = sign(input, expected, () => 110_000);
    input.memberId = "changed"; expected.memberId = "changed";
    expect(await verify(await pending, binding, () => 110_000)).toEqual(claims());
  });
});
