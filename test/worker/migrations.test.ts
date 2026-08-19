/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";

describe("Phase 1 control-plane migrations", () => {
  it("creates the control-plane tables and deterministic Spaces", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS);

    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('members', 'spaces', 'collections', 'submissions', 'audit_events') ORDER BY name",
    ).all<{ name: string }>();
    expect(tables.results).toEqual([
      { name: "audit_events" },
      { name: "collections" },
      { name: "members" },
      { name: "spaces" },
      { name: "submissions" },
    ]);

    const spaces = await env.DB.prepare(
      "SELECT slug, kind, read_only FROM spaces ORDER BY slug",
    ).all<{ slug: string; kind: string; read_only: number }>();
    expect(spaces.results).toEqual([
      { slug: "default", kind: "shared", read_only: 0 },
      { slug: "legacy-personal", kind: "legacy", read_only: 1 },
    ]);
  });

  it("preserves Phase 1 data and enforces GitHub authentication constraints", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS);

    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('members', 'auth_sessions', 'automation_nonces') ORDER BY name",
    ).all<{ name: string }>();
    expect(tables.results).toEqual([
      { name: "auth_sessions" },
      { name: "automation_nonces" },
      { name: "members" },
    ]);

    const indexes = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('auth_sessions_member_expires_created', 'auth_sessions_expires', 'automation_nonces_expires') ORDER BY name",
    ).all<{ name: string }>();
    expect(indexes.results).toEqual([
      { name: "auth_sessions_expires" },
      { name: "auth_sessions_member_expires_created" },
      { name: "automation_nonces_expires" },
    ]);

    const phaseOneSpace = await env.DB.prepare(
      "SELECT slug FROM spaces WHERE id = ?",
    )
      .bind("default")
      .first<{ slug: string }>();
    expect(phaseOneSpace).toEqual({ slug: "default" });

    const createdAt = "2026-08-19T00:00:00.000Z";
    const expiresAt = "2026-08-20T00:00:00.000Z";
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        "member-1",
        "github:1",
        "member@example.test",
        "contributor",
        "active",
        createdAt,
        createdAt,
      )
      .run();

    await expect(
      env.DB.prepare(
        "INSERT INTO auth_sessions (token_hash, member_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
      )
        .bind("token-1", "missing-member", createdAt, expiresAt, createdAt)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        "INSERT INTO automation_nonces (client_id, nonce, expires_at) VALUES (?, ?, ?)",
      )
        .bind("smoke", "same", expiresAt)
        .run(),
    ).resolves.toBeDefined();
    await expect(
      env.DB.prepare(
        "INSERT INTO automation_nonces (client_id, nonce, expires_at) VALUES (?, ?, ?)",
      )
        .bind("smoke", "same", expiresAt)
        .run(),
    ).rejects.toThrow();
  });
});
