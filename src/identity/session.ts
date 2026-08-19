import { APP_CONFIG } from "../config";
import { AppError } from "../http";
import type { MembersRepositoryPort } from "../members/repository";
import type { Member } from "../members/types";
import { readUniqueCookie } from "./oauth-cookies";

const SESSION_COOKIE_NAME = "__Host-memory-session";
const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_LENGTH = 43;
const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const encoder = new TextEncoder();

export interface SessionPrincipalRecord {
  member: Member;
  tokenHash: string;
}

export interface SessionServiceOptions {
  now?: () => Date;
  randomBytes?: (length: number) => Uint8Array;
  waitUntil: (promise: Promise<unknown>) => void;
}

type JoinedSessionRow = {
  token_hash: string;
  member_id: string;
  expires_at: string;
  member_status: Member["status"];
};

export class SessionService {
  private readonly now: () => Date;
  private readonly randomBytes: (length: number) => Uint8Array;
  private readonly waitUntil: (promise: Promise<unknown>) => void;

  constructor(
    private readonly db: D1Database,
    private readonly members: Pick<MembersRepositoryPort, "findById">,
    options: SessionServiceOptions,
  ) {
    if (typeof options.waitUntil !== "function") throw new TypeError("waitUntil is required");
    this.now = options.now || (() => new Date());
    this.randomBytes = options.randomBytes || ((length) => crypto.getRandomValues(new Uint8Array(length)));
    this.waitUntil = options.waitUntil;
  }

  async create(member: Member): Promise<{ token: string; expiresAt: string }> {
    if (member.status !== "active") throw memberDisabled();
    const now = this.currentTime();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + APP_CONFIG.sessionCookieMaxAgeSeconds * 1_000).toISOString();
    const token = this.newToken();
    const tokenHash = await sha256Hex(token);
    const results = await this.db.batch([
      this.db.prepare(
        `INSERT INTO auth_sessions (token_hash, member_id, created_at, expires_at, last_seen_at)
         SELECT ?, id, ?, ?, ? FROM members WHERE id = ? AND status = 'active'`,
      ).bind(tokenHash, createdAt, expiresAt, createdAt, member.id),
      this.db.prepare(
        `DELETE FROM auth_sessions
         WHERE token_hash IN (
           SELECT token_hash FROM auth_sessions
           WHERE member_id = ?
           ORDER BY expires_at DESC, created_at DESC, token_hash DESC
           LIMIT -1 OFFSET 5
         )`,
      ).bind(member.id),
    ]);
    if (results[0]?.meta.changes !== 1) {
      const current = await this.members.findById(member.id);
      if (current?.status === "disabled") throw memberDisabled();
      throw new Error("Session did not persist");
    }
    return { token, expiresAt };
  }

  async resolve(request: Request): Promise<Member> {
    return (await this.resolvePrincipal(request)).member;
  }

  async logout(request: Request): Promise<void> {
    const token = readSessionToken(request);
    if (!token) return;
    const tokenHash = await sha256Hex(token);
    await this.db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(tokenHash).run();
  }

  private async resolvePrincipal(request: Request): Promise<SessionPrincipalRecord> {
    const token = readSessionToken(request);
    if (!token) throw authenticationRequired();
    const tokenHash = await sha256Hex(token);
    const now = this.currentTime();
    const row = await this.db.prepare(
      `SELECT s.token_hash, s.member_id, s.expires_at, m.status AS member_status
       FROM auth_sessions AS s
       INNER JOIN members AS m ON m.id = s.member_id
       WHERE s.token_hash = ?
       LIMIT 1`,
    ).bind(tokenHash).first<JoinedSessionRow>();
    this.scheduleExpiredCleanup(now.toISOString());
    if (!row) throw authenticationRequired();

    const expiresAt = Date.parse(row.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) throw authenticationRequired();
    if (row.member_status !== "active") {
      if (row.member_status === "disabled") throw memberDisabled();
      throw authenticationRequired();
    }

    const member = await this.members.findById(row.member_id);
    if (!member || member.id !== row.member_id) throw authenticationRequired();
    if (member.status !== "active") throw memberDisabled();
    return { member, tokenHash: row.token_hash };
  }

  private scheduleExpiredCleanup(now: string): void {
    const cleanup = this.db.prepare(
      `DELETE FROM auth_sessions
       WHERE token_hash IN (
         SELECT token_hash FROM auth_sessions
         WHERE expires_at <= ?
         ORDER BY expires_at ASC, token_hash ASC
         LIMIT 50
       )`,
    ).bind(now).run()
      .then(() => undefined)
      .catch(() => { console.warn("expired session cleanup failed"); });
    this.waitUntil(cleanup);
  }

  private newToken(): string {
    const bytes = this.randomBytes(SESSION_TOKEN_BYTES);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== SESSION_TOKEN_BYTES) {
      throw new Error("Session token generation failed");
    }
    return base64Url(bytes);
  }

  private currentTime(): Date {
    const now = this.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Session clock is invalid");
    return now;
  }
}

function readSessionToken(request: Request): string | undefined {
  const token = readUniqueCookie(request, SESSION_COOKIE_NAME, SESSION_TOKEN_LENGTH);
  return token && SESSION_TOKEN.test(token) ? token : undefined;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function authenticationRequired(): AppError {
  return new AppError("AUTH_REQUIRED", "Authentication required", 401);
}

function memberDisabled(): AppError {
  return new AppError("MEMBER_DISABLED", "Member access is disabled", 403);
}
