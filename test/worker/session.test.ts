/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import type { Member } from "../../src/members/types";
import { MIGRATIONS } from "../fixtures/d1";

const START = Date.parse("2026-08-19T12:00:00.000Z");

describe("browser sessions in D1", () => {
  let member: Member;
  let members: MembersRepository;

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    members = new MembersRepository(env.DB);
    member = await members.insert({
      id: "session-member",
      identitySubject: "github:42",
      email: "member@example.test",
      role: "contributor",
      status: "active",
      createdAt: new Date(START).toISOString(),
      updatedAt: new Date(START).toISOString(),
    });
  });

  it("transactionally keeps only the five newest sessions and never persists a raw token in session text fields", async () => {
    const created = [];
    for (let index = 0; index < 6; index += 1) {
      created.push(await serviceAt(index, members).create(member));
    }

    const rows = await sessionRows();
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.created_at)).toEqual([
      "2026-08-19T12:00:05.000Z",
      "2026-08-19T12:00:04.000Z",
      "2026-08-19T12:00:03.000Z",
      "2026-08-19T12:00:02.000Z",
      "2026-08-19T12:00:01.000Z",
    ]);
    expect(rows.every((row) => /^[0-9a-f]{64}$/u.test(row.token_hash))).toBe(true);
    const persistedText = JSON.stringify(rows);
    for (const { token } of created) expect(persistedText).not.toContain(token);
  });

  it("keeps the five-row bound when the sixth and seventh sessions are created concurrently", async () => {
    for (let index = 0; index < 5; index += 1) await serviceAt(index, members).create(member);

    await Promise.all([
      serviceAt(5, members).create(member),
      serviceAt(6, members).create(member),
    ]);

    const rows = await sessionRows();
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.created_at)).toEqual([
      "2026-08-19T12:00:06.000Z",
      "2026-08-19T12:00:05.000Z",
      "2026-08-19T12:00:04.000Z",
      "2026-08-19T12:00:03.000Z",
      "2026-08-19T12:00:02.000Z",
    ]);
  });

  it("does not insert a session for a member disabled after the login read", async () => {
    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = ?").bind(member.id).run();

    await expect(serviceAt(0, members).create(member)).rejects.toMatchObject({
      code: "MEMBER_DISABLED", status: 403,
    });
    await expect(sessionRows()).resolves.toEqual([]);
  });

  it("deletes at most fifty expired sessions through the injected lifecycle sink", async () => {
    const scheduled: Promise<unknown>[] = [];
    const active = await serviceAt(60, members, (promise) => { scheduled.push(promise); }).create(member);
    const expiredAt = "2026-08-18T00:00:00.000Z";
    const createdAt = "2026-08-11T00:00:00.000Z";
    for (let index = 0; index < 55; index += 1) {
      await env.DB.prepare(
        "INSERT INTO auth_sessions (token_hash, member_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(String(index).padStart(64, "0"), member.id, createdAt, expiredAt, createdAt).run();
    }
    const service = new SessionService(env.DB, members, {
      now: () => new Date("2026-08-20T12:00:00.000Z"),
      randomBytes: bytesFor(61),
      waitUntil: (promise) => { scheduled.push(promise); },
    });

    await expect(service.resolve(cookieRequest(active.token))).resolves.toEqual(member);
    expect(scheduled).toHaveLength(1);
    await Promise.all(scheduled);
    const expired = await env.DB.prepare(
      "SELECT token_hash FROM auth_sessions WHERE expires_at <= ? ORDER BY token_hash",
    ).bind("2026-08-20T12:00:00.000Z").all<{ token_hash: string }>();
    expect(expired.results).toHaveLength(5);
  });
});

function serviceAt(
  offsetSeconds: number,
  members: MembersRepository,
  waitUntil: (promise: Promise<unknown>) => void = () => undefined,
): SessionService {
  return new SessionService(env.DB, members, {
    now: () => new Date(START + offsetSeconds * 1_000),
    randomBytes: bytesFor(offsetSeconds + 1),
    waitUntil,
  });
}

function bytesFor(value: number): (length: number) => Uint8Array {
  return (length) => new Uint8Array(length).fill(value);
}

async function sessionRows() {
  const result = await env.DB.prepare(
    "SELECT token_hash, member_id, created_at, expires_at, last_seen_at FROM auth_sessions ORDER BY expires_at DESC, created_at DESC, token_hash DESC",
  ).all<{
    token_hash: string;
    member_id: string;
    created_at: string;
    expires_at: string;
    last_seen_at: string;
  }>();
  return result.results;
}

function cookieRequest(token: string): Request {
  return new Request("https://memory.crgmhrc.asia/api/session", {
    headers: { cookie: `__Host-memory-session=${token}` },
  });
}
