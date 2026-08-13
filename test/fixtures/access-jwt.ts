import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";

export const ACCESS_TEAM_DOMAIN = "team.example.test";
export const ACCESS_AUDIENCE = "local-access-audience";

export interface AccessJwtFixture {
  publicJwk: JWK;
  sign(claims?: Record<string, unknown>, overrides?: AccessJwtOverrides): Promise<string>;
  signService(claims?: Record<string, unknown>, overrides?: AccessJwtOverrides): Promise<string>;
}

export interface AccessJwtOverrides {
  issuer?: string;
  audience?: string;
}

export async function createAccessJwtFixture(): Promise<AccessJwtFixture> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "local-test-key";
  publicJwk.alg = "RS256";

  return {
    publicJwk,
    sign: (claims = {}, overrides = {}) => signAccessJwt(privateKey, claims, overrides),
    signService: (claims = {}, overrides = {}) => signServiceAccessJwt(privateKey, claims, overrides),
  };
}

async function signServiceAccessJwt(
  key: CryptoKey,
  claims: Record<string, unknown>,
  overrides: AccessJwtOverrides,
): Promise<string> {
  return signAccessJwt(key, { sub: "", email: undefined, common_name: "local-service-token", ...claims }, overrides);
}

async function signAccessJwt(
  key: CryptoKey,
  claims: Record<string, unknown>,
  { issuer = `https://${ACCESS_TEAM_DOMAIN}`, audience = ACCESS_AUDIENCE }: AccessJwtOverrides,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({ sub: "user-123", email: "admin@example.test", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "local-test-key" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(now);
  if (!("exp" in claims)) jwt.setExpirationTime(now + 60);
  return jwt.sign(key);
}
