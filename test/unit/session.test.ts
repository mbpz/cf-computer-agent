import { describe, expect, it } from "vitest";
import { AppError, requireSameOrigin } from "../../src/http";
import { SessionService, type SessionServiceOptions } from "../../src/identity/session";
import type { Member } from "../../src/members/types";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const TOKEN = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const TOKEN_HASH = "ea866a757e4c38babfa8127cbe9a409d3e1f93a00ff1488ff735fcf917afffd0";

describe("SessionService", () => {
  it("creates a 256-bit opaque token and persists only its lowercase SHA-256 hash for exactly seven days", async () => {
    const fixture = sessionFixture();

    await expect(fixture.service.create(fixture.member)).resolves.toEqual({
      token: TOKEN,
      expiresAt: "2026-08-26T12:00:00.000Z",
    });

    expect(fixture.db.rows).toEqual([{
      token_hash: TOKEN_HASH,
      member_id: fixture.member.id,
      created_at: NOW.toISOString(),
      expires_at: "2026-08-26T12:00:00.000Z",
      last_seen_at: NOW.toISOString(),
    }]);
    expect(JSON.stringify(fixture.db.rows)).not.toContain(TOKEN);
  });

  it("rejects random sources that do not return exactly 256 bits", async () => {
    for (const randomBytes of [
      () => new Uint8Array(31),
      () => new Uint8Array(33),
      () => [] as unknown as Uint8Array,
    ]) {
      const fixture = sessionFixture({ randomBytes });
      await expect(fixture.service.create(fixture.member)).rejects.toThrow("Session token generation failed");
      expect(fixture.db.rows).toEqual([]);
    }
  });

  it("requires D1 to report exactly one inserted session row", async () => {
    const fixture = sessionFixture();
    fixture.db.insertChanges = 0;

    await expect(fixture.service.create(fixture.member)).rejects.toThrow("Session did not persist");
  });

  it("does not create a session when the member became disabled after login resolution", async () => {
    const fixture = sessionFixture();
    fixture.members.set(fixture.member.id, { ...fixture.member, status: "disabled" });

    await expect(fixture.service.create(fixture.member)).rejects.toMatchObject({
      code: "MEMBER_DISABLED", status: 403,
    });
    expect(fixture.db.rows).toEqual([]);
  });

  it("resolves an active member without sliding or mutating the absolute expiry", async () => {
    const fixture = sessionFixture();
    const created = await fixture.service.create(fixture.member);
    const persisted = { ...fixture.db.rows[0]! };
    fixture.clock.now = new Date("2026-08-25T12:00:00.000Z");

    await expect(fixture.service.resolve(sessionRequest(created.token))).resolves.toEqual(fixture.member);
    expect(fixture.db.rows).toEqual([persisted]);
  });

  it.each([
    undefined,
    "__Host-memory-session=short",
    "__Host-memory-session=has%20encoding",
    `__Host-memory-session=${TOKEN}; __Host-memory-session=${TOKEN}`,
    `__Host-memory-session=${TOKEN}=`,
    `__Host-memory-session= ${TOKEN}`,
  ])("rejects a missing, malformed, or duplicate session cookie: %s", async (cookie) => {
    const fixture = sessionFixture();
    await fixture.service.create(fixture.member);

    await expect(fixture.service.resolve(cookieRequest(cookie))).rejects.toMatchObject({
      code: "AUTH_REQUIRED", status: 401,
    });
  });

  it("rejects an expired session and schedules bounded expiration cleanup", async () => {
    const fixture = sessionFixture();
    const created = await fixture.service.create(fixture.member);
    fixture.db.rows.push(...Array.from({ length: 50 }, (_value, index) => ({
      token_hash: String(index).padStart(64, "0"),
      member_id: fixture.member.id,
      created_at: "2026-08-01T00:00:00.000Z",
      expires_at: "2026-08-02T00:00:00.000Z",
      last_seen_at: "2026-08-01T00:00:00.000Z",
    })));
    fixture.clock.now = new Date("2026-08-27T12:00:00.000Z");

    await expect(fixture.service.resolve(sessionRequest(created.token))).rejects.toMatchObject({
      code: "AUTH_REQUIRED", status: 401,
    });
    expect(fixture.scheduled).toHaveLength(1);
    await Promise.all(fixture.scheduled);
    expect(fixture.db.rows).toHaveLength(1);
  });

  it("rejects a session as soon as the current member is disabled", async () => {
    const fixture = sessionFixture();
    const created = await fixture.service.create(fixture.member);
    fixture.members.set(fixture.member.id, { ...fixture.member, status: "disabled" });

    await expect(fixture.service.resolve(sessionRequest(created.token))).rejects.toMatchObject({
      code: "MEMBER_DISABLED", status: 403,
    });
  });

  it("rejects a session whose member no longer resolves", async () => {
    const fixture = sessionFixture();
    const created = await fixture.service.create(fixture.member);
    fixture.members.delete(fixture.member.id);

    await expect(fixture.service.resolve(sessionRequest(created.token))).rejects.toMatchObject({
      code: "AUTH_REQUIRED", status: 401,
    });
  });

  it("deletes the hashed credential and makes logout idempotent", async () => {
    const fixture = sessionFixture();
    const created = await fixture.service.create(fixture.member);
    const request = sessionRequest(created.token);

    await expect(fixture.service.logout(request)).resolves.toBeUndefined();
    await expect(fixture.service.logout(request)).resolves.toBeUndefined();
    await expect(fixture.service.logout(cookieRequest())).resolves.toBeUndefined();
    expect(fixture.db.rows).toEqual([]);
  });

  it("requires an explicit lifecycle sink for cleanup work", () => {
    const fixture = sessionFixture();
    expect(() => new SessionService(
      fixture.db.database,
      { findById: async () => fixture.member },
      {} as SessionServiceOptions,
    )).toThrow("waitUntil is required");
  });
});

describe("requireSameOrigin", () => {
  it("accepts only the exact configured HTTPS origin", () => {
    expect(() => requireSameOrigin(originRequest("https://memory.crgmhrc.asia"), "https://memory.crgmhrc.asia"))
      .not.toThrow();
  });

  it.each([
    undefined,
    "null",
    "https://foreign.example.test",
    "https://memory.crgmhrc.asia/",
    "http://memory.crgmhrc.asia",
  ])("rejects a missing or foreign Origin: %s", (origin) => {
    expect(() => requireSameOrigin(originRequest(origin), "https://memory.crgmhrc.asia"))
      .toThrow(expect.objectContaining({ code: "FORBIDDEN", status: 403 }));
  });

  it.each([
    "http://memory.crgmhrc.asia",
    "https://memory.crgmhrc.asia/",
    "not-an-origin",
  ])("fails closed for a noncanonical configured origin: %s", (canonicalOrigin) => {
    expect(() => requireSameOrigin(originRequest(canonicalOrigin), canonicalOrigin))
      .toThrow(expect.objectContaining({ code: "FORBIDDEN", status: 403 }));
  });
});

function sessionFixture(overrides: Partial<SessionServiceOptions> = {}) {
  const member = activeMember();
  const members = new Map([[member.id, member]]);
  const db = new FakeD1(members);
  const clock = { now: new Date(NOW) };
  const scheduled: Promise<unknown>[] = [];
  const service = new SessionService(db.database, {
    findById: async (id) => members.get(id) ?? null,
  }, {
    now: () => new Date(clock.now),
    randomBytes: (length) => Uint8Array.from({ length }, (_value, index) => index),
    waitUntil: (promise) => { scheduled.push(promise); },
    ...overrides,
  });
  return { member, members, db, clock, scheduled, service };
}

function activeMember(): Member {
  return {
    id: "member-1",
    identitySubject: "github:42",
    email: "member@example.test",
    role: "contributor",
    status: "active",
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    lastSeenAt: null,
  };
}

function cookieRequest(cookie?: string): Request {
  return new Request("https://memory.crgmhrc.asia/api/session", {
    headers: cookie === undefined ? {} : { cookie },
  });
}

function sessionRequest(token: string): Request {
  return cookieRequest(`__Host-memory-session=${token}`);
}

function originRequest(origin?: string): Request {
  return new Request("https://memory.crgmhrc.asia/auth/logout", {
    method: "POST",
    headers: origin === undefined ? {} : { origin },
  });
}

type FakeSessionRow = {
  token_hash: string;
  member_id: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
};

class FakeD1 {
  readonly rows: FakeSessionRow[] = [];
  insertChanges = 1;

  constructor(private readonly members: Map<string, Member>) {}

  get database(): D1Database {
    return this as unknown as D1Database;
  }

  prepare(query: string): D1PreparedStatement {
    return new FakeStatement(this, query) as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const snapshot = this.rows.map((row) => ({ ...row }));
    try {
      const results: D1Result<T>[] = [];
      for (const statement of statements) results.push(await statement.run<T>());
      return results;
    } catch (error) {
      this.rows.splice(0, this.rows.length, ...snapshot);
      throw error;
    }
  }

  async first<T>(query: string, bindings: unknown[]): Promise<T | null> {
    const sql = normalized(query);
    if (!sql.includes("FROM AUTH_SESSIONS AS S") || !sql.includes("JOIN MEMBERS AS M")) {
      throw new Error(`Unexpected first query: ${sql}`);
    }
    const row = this.rows.find((candidate) => candidate.token_hash === bindings[0]);
    const member = row ? this.members.get(row.member_id) : undefined;
    if (!row || !member) return null;
    return {
      token_hash: row.token_hash,
      member_id: row.member_id,
      expires_at: row.expires_at,
      member_status: member.status,
    } as T;
  }

  async run<T>(query: string, bindings: unknown[]): Promise<D1Result<T>> {
    const sql = normalized(query);
    let changes = 0;
    if (sql.startsWith("INSERT INTO AUTH_SESSIONS")) {
      const current = this.members.get(String(bindings[4]));
      changes = this.insertChanges === 1 && current?.status === "active" ? 1 : 0;
      if (changes === 1) {
        this.rows.push({
          token_hash: String(bindings[0]),
          member_id: String(bindings[4]),
          created_at: String(bindings[1]),
          expires_at: String(bindings[2]),
          last_seen_at: String(bindings[3]),
        });
      }
    } else if (sql.includes("LIMIT -1 OFFSET 5")) {
      const memberId = String(bindings[0]);
      const keep = new Set(this.rows
        .filter((row) => row.member_id === memberId)
        .sort(newestFirst)
        .slice(0, 5)
        .map((row) => row.token_hash));
      changes = this.remove((row) => row.member_id === memberId && !keep.has(row.token_hash));
    } else if (sql.includes("WHERE EXPIRES_AT <= ?") && sql.includes("LIMIT 50")) {
      const expired = new Set(this.rows
        .filter((row) => row.expires_at <= String(bindings[0]))
        .sort(oldestFirst)
        .slice(0, 50)
        .map((row) => row.token_hash));
      changes = this.remove((row) => expired.has(row.token_hash));
    } else if (sql.startsWith("DELETE FROM AUTH_SESSIONS") && sql.includes("WHERE TOKEN_HASH = ?")) {
      changes = this.remove((row) => row.token_hash === bindings[0]);
    } else {
      throw new Error(`Unexpected run query: ${sql}`);
    }
    return { meta: { changes } } as D1Result<T>;
  }

  private remove(predicate: (row: FakeSessionRow) => boolean): number {
    const retained = this.rows.filter((row) => !predicate(row));
    const changes = this.rows.length - retained.length;
    this.rows.splice(0, this.rows.length, ...retained);
    return changes;
  }
}

class FakeStatement {
  private bindings: unknown[] = [];

  constructor(private readonly db: FakeD1, private readonly query: string) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.bindings = values;
    return this as unknown as D1PreparedStatement;
  }

  first<T>(): Promise<T | null> {
    return this.db.first<T>(this.query, this.bindings);
  }

  run<T = unknown>(): Promise<D1Result<T>> {
    return this.db.run<T>(this.query, this.bindings);
  }
}

function newestFirst(left: FakeSessionRow, right: FakeSessionRow): number {
  return right.expires_at.localeCompare(left.expires_at)
    || right.created_at.localeCompare(left.created_at)
    || right.token_hash.localeCompare(left.token_hash);
}

function oldestFirst(left: FakeSessionRow, right: FakeSessionRow): number {
  return left.expires_at.localeCompare(right.expires_at) || left.token_hash.localeCompare(right.token_hash);
}

function normalized(query: string): string {
  return query.replace(/\s+/gu, " ").trim().toUpperCase();
}
