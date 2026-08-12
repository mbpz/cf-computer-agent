import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTVerifyOptions } from "jose";
import { APP_CONFIG } from "../config";
import { AppError } from "../http";

const jwksByTeamDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export interface AccessIdentity {
  sub: string;
  email: string;
}

export interface AccessEnvironment {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  BOOTSTRAP_ADMIN_EMAIL?: string;
}

export interface VerifyAccessJwtOptions {
  jwks?: JWTVerifyGetKey;
}

export async function verifyAccessJwt(
  request: Request,
  env: AccessEnvironment,
  options: VerifyAccessJwtOptions = {},
): Promise<AccessIdentity> {
  const teamDomain = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
  const audience = env.ACCESS_AUD;
  if (!teamDomain || !audience) {
    throw new AppError("ACCESS_CONFIG_INVALID", "Access authentication is not configured", 503);
  }

  const assertion = request.headers.get(APP_CONFIG.accessJwtAssertionHeader);
  if (!assertion) throw new AppError("ACCESS_TOKEN_REQUIRED", "Access authentication required", 401);

  try {
    const { payload } = await jwtVerify(
      assertion,
      options.jwks || getJwks(teamDomain),
      verifyOptions(teamDomain, audience),
    );
    const sub = normalizeSubject(payload.sub);
    const email = canonicalizeEmail(payload.email);
    if (!sub || !email) {
      throw new AppError("ACCESS_TOKEN_INVALID", "Access identity is invalid", 401);
    }
    return { sub, email };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("ACCESS_TOKEN_INVALID", "Access authentication failed", 401);
  }
}

function normalizeTeamDomain(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && url.pathname === "/" && !url.search && !url.hash ? url.hostname.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

function getJwks(teamDomain: string): JWTVerifyGetKey {
  let jwks = jwksByTeamDomain.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksByTeamDomain.set(teamDomain, jwks);
  }
  return jwks;
}

function verifyOptions(teamDomain: string, audience: string): JWTVerifyOptions {
  return {
    issuer: `https://${teamDomain}`,
    audience,
    requiredClaims: ["exp"],
  };
}

export function canonicalizeEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const email = value.trim().toLowerCase();
  return email || undefined;
}

function normalizeSubject(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const sub = value.trim();
  return sub || undefined;
}
