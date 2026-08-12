import { createLocalJWKSet } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACCESS_AUDIENCE, ACCESS_TEAM_DOMAIN, createAccessJwtFixture } from "../fixtures/access-jwt";
import { verifyAccessJwt } from "../../src/identity/access-jwt";

const env = {
  ACCESS_TEAM_DOMAIN,
  ACCESS_AUD: ACCESS_AUDIENCE,
};

const request = (token?: string) => new Request("https://example.test/api/notes", {
  headers: token ? { "cf-access-jwt-assertion": token } : {},
});

describe("verifyAccessJwt", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the verified Access subject and email", async () => {
    const fixture = await createAccessJwtFixture();
    mockJwks(fixture.publicJwk);

    await expect(verifyAccessJwt(request(await fixture.sign()), env)).resolves.toEqual({
      sub: "user-123",
      email: "admin@example.test",
    });
  });

  it("rejects a missing assertion", async () => {
    await expect(verifyAccessJwt(request(), env)).rejects.toMatchObject({
      code: "ACCESS_TOKEN_REQUIRED", status: 401,
    });
  });

  it("rejects an assertion signed by another key", async () => {
    const trusted = await createAccessJwtFixture();
    const untrusted = await createAccessJwtFixture();
    mockJwks(trusted.publicJwk);

    await expect(verifyAccessJwt(request(await untrusted.sign()), env)).rejects.toMatchObject({
      code: "ACCESS_TOKEN_INVALID", status: 401,
    });
  });

  it("rejects assertions with the wrong issuer or audience", async () => {
    const fixture = await createAccessJwtFixture();
    const options = { jwks: createLocalJWKSet({ keys: [fixture.publicJwk] }) };

    await expect(verifyAccessJwt(request(await fixture.sign({}, { issuer: "https://wrong.example.test" })), env, options))
      .rejects.toMatchObject({ code: "ACCESS_TOKEN_INVALID" });
    await expect(verifyAccessJwt(request(await fixture.sign({}, { audience: "other-audience" })), env, options))
      .rejects.toMatchObject({ code: "ACCESS_TOKEN_INVALID" });
  });

  it("rejects expired and not-yet-valid assertions", async () => {
    const fixture = await createAccessJwtFixture();
    const options = { jwks: createLocalJWKSet({ keys: [fixture.publicJwk] }) };
    const now = Math.floor(Date.now() / 1000);

    await expect(verifyAccessJwt(request(await fixture.sign({ exp: now - 1 })), env, options))
      .rejects.toMatchObject({ code: "ACCESS_TOKEN_INVALID" });
    await expect(verifyAccessJwt(request(await fixture.sign({ nbf: now + 60 })), env, options))
      .rejects.toMatchObject({ code: "ACCESS_TOKEN_INVALID" });
  });

  it("rejects an assertion without an expiration", async () => {
    const fixture = await createAccessJwtFixture();
    const options = { jwks: createLocalJWKSet({ keys: [fixture.publicJwk] }) };

    await expect(verifyAccessJwt(request(await fixture.sign({ exp: undefined })), env, options))
      .rejects.toMatchObject({ code: "ACCESS_TOKEN_INVALID" });
  });

  it("rejects missing, wrong-type, and whitespace-only identity claims", async () => {
    const fixture = await createAccessJwtFixture();
    const options = { jwks: createLocalJWKSet({ keys: [fixture.publicJwk] }) };

    await expect(verifyAccessJwt(request(await fixture.sign({ sub: undefined })), env, options))
      .rejects.toMatchObject({ code: "ACCESS_TOKEN_INVALID" });
    await expect(verifyAccessJwt(request(await fixture.sign({ email: undefined })), env, options))
      .rejects.toMatchObject({ code: "ACCESS_TOKEN_INVALID" });
    await expect(verifyAccessJwt(request(await fixture.sign({ sub: 123 })), env, options))
      .rejects.toMatchObject({ code: "ACCESS_TOKEN_INVALID" });
    await expect(verifyAccessJwt(request(await fixture.sign({ email: ["member@example.test"] })), env, options))
      .rejects.toMatchObject({ code: "ACCESS_TOKEN_INVALID" });
    await expect(verifyAccessJwt(request(await fixture.sign({ sub: " \t " })), env, options))
      .rejects.toMatchObject({ code: "ACCESS_TOKEN_INVALID" });
    await expect(verifyAccessJwt(request(await fixture.sign({ email: "\n " })), env, options))
      .rejects.toMatchObject({ code: "ACCESS_TOKEN_INVALID" });
  });

  it("returns a trimmed opaque subject and canonical email", async () => {
    const fixture = await createAccessJwtFixture();
    const options = { jwks: createLocalJWKSet({ keys: [fixture.publicJwk] }) };

    await expect(verifyAccessJwt(request(await fixture.sign({
      sub: "  Mixed-Case Subject  ",
      email: "  ADMIN@Example.Test  ",
    })), env, options)).resolves.toEqual({
      sub: "Mixed-Case Subject",
      email: "admin@example.test",
    });
  });

  it("fails closed when Access configuration is incomplete", async () => {
    await expect(verifyAccessJwt(request("locally-formed-placeholder"), { ACCESS_TEAM_DOMAIN })).rejects.toMatchObject({
      code: "ACCESS_CONFIG_INVALID", status: 503,
    });
  });

  it("caches the remote JWK set per normalized team domain without caching identities", async () => {
    const fixture = await createAccessJwtFixture();
    const fetch = mockJwks(fixture.publicJwk);
    const teamDomain = "cache-test.example.test";
    const config = { ACCESS_TEAM_DOMAIN: `https://${teamDomain.toUpperCase()}/`, ACCESS_AUD: ACCESS_AUDIENCE };
    const signingOptions = { issuer: `https://${teamDomain}` };

    await expect(verifyAccessJwt(request(await fixture.sign({}, signingOptions)), config)).resolves.toEqual({ sub: "user-123", email: "admin@example.test" });
    await expect(verifyAccessJwt(request(await fixture.sign({ sub: "user-456", email: "member@example.test" }, signingOptions)), config))
      .resolves.toEqual({ sub: "user-456", email: "member@example.test" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

function mockJwks(publicJwk: Record<string, unknown>) {
  const fetch = vi.fn(async () => Response.json({ keys: [publicJwk] }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
