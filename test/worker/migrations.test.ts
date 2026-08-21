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

  it("creates the M1 knowledge schema with enforced relationships and searchable FTS", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS);

    const requiredTables = [
      "sources",
      "source_versions",
      "tags",
      "revision_tags",
      "reviews",
      "publication_intents",
      "jobs",
      "knowledge_items",
      "revisions",
      "chunks",
      "chunks_fts",
    ];
    for (const name of requiredTables) {
      await expect(
        env.DB.prepare("SELECT name FROM sqlite_master WHERE name = ?")
          .bind(name)
          .first(),
      ).resolves.toBeTruthy();
    }

    const requiredIndexes = [
      "knowledge_items_current_page",
      "sources_owner_page",
      "chunks_revision",
      "publication_intents_pending",
      "submissions_idempotency",
      "submissions_owner_page",
      "submissions_admin_page",
    ];
    const indexes = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'index' AND name IN (${requiredIndexes.map(() => "?").join(", ")})
       ORDER BY name`,
    )
      .bind(...requiredIndexes)
      .all<{ name: string }>();
    expect(indexes.results.map(({ name }) => name)).toEqual(
      [...requiredIndexes].sort(),
    );

    const currentPageColumns = await env.DB.prepare(
      "PRAGMA index_xinfo('knowledge_items_current_page')",
    ).all<{ name: string; desc: number; key: number }>();
    expect(
      currentPageColumns.results
        .filter(({ key }) => key === 1)
        .map(({ name, desc }) => ({ name, desc })),
    ).toEqual([
      { name: "status", desc: 0 },
      { name: "updated_at", desc: 1 },
      { name: "id", desc: 1 },
    ]);

    const now = "2026-08-21T00:00:00.000Z";
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        "member-admin",
        "github:admin",
        "admin@example.test",
        "admin",
        "active",
        now,
        now,
      )
      .run();

    await expect(
      env.DB.prepare(
        "INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, visibility, published_by, published_at) VALUES ('r', 'missing', 'missing', '/x', 'h', 't', 'shared', 'member-admin', ?)",
      )
        .bind(now)
        .run(),
    ).rejects.toThrow();

    await env.DB.prepare(
      "INSERT INTO chunks_fts (chunk_id, title, tags, body) VALUES (?, ?, ?, ?)",
    )
      .bind("chunk-1", "Migration Garden", "m1 schema", "searchable knowledge")
      .run();
    const match = await env.DB.prepare(
      "SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH ?",
    )
      .bind("searchable")
      .first<{ chunk_id: string }>();
    expect(match).toEqual({ chunk_id: "chunk-1" });

    const foreignKeyViolations = await env.DB.prepare(
      "PRAGMA foreign_key_check",
    ).all();
    expect(foreignKeyViolations.results).toEqual([]);

    await applyD1Migrations(env.DB, MIGRATIONS);
    await expect(
      env.DB.prepare("SELECT count(*) AS count FROM chunks_fts").first(),
    ).resolves.toEqual({ count: 1 });
  });

  it("upgrades submissions without changing legacy rows or indexes", async () => {
    const priorMigrations = MIGRATIONS.slice(0, 2);
    await applyD1Migrations(env.DB, priorMigrations);

    const now = "2026-08-21T01:02:03.004Z";
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        "member-upgrade",
        "github:upgrade",
        "upgrade@example.test",
        "contributor",
        "active",
        now,
        now,
      )
      .run();

    const legacyRows = [
      {
        id: "submission-rich",
        kind: "rich_text",
        status: "review_pending",
        title: "Rich legacy row",
        content: "<p>Line one</p>\r\n<p>记忆花园 🧠 &amp; exact bytes</p>",
      },
      {
        id: "submission-code",
        kind: "code",
        status: "draft",
        title: "Code legacy row",
        content: "export const answer = 42;\n",
      },
    ] as const;
    for (const row of legacyRows) {
      await env.DB.prepare(
        `INSERT INTO submissions
          (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, created_at, updated_at)
         VALUES (?, 'member-upgrade', 'default', NULL, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(row.id, row.kind, row.status, row.title, row.content, now, now)
        .run();
    }

    const bytesBefore = await env.DB.prepare(
      "SELECT id, hex(content) AS content_hex FROM submissions ORDER BY id",
    ).all<{ id: string; content_hex: string }>();

    await applyD1Migrations(env.DB, MIGRATIONS);

    const upgradedRows = await env.DB.prepare(
      `SELECT id, kind, status, title, content, idempotency_key
       FROM submissions ORDER BY id`,
    ).all<{
      id: string;
      kind: string;
      status: string;
      title: string;
      content: string;
      idempotency_key: string | null;
    }>();
    expect(upgradedRows.results).toEqual(
      [...legacyRows]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((row) => ({ ...row, idempotency_key: null })),
    );

    const bytesAfter = await env.DB.prepare(
      "SELECT id, hex(content) AS content_hex FROM submissions ORDER BY id",
    ).all<{ id: string; content_hex: string }>();
    expect(bytesAfter.results).toEqual(bytesBefore.results);

    await expect(
      env.DB.prepare("UPDATE submissions SET status = 'published' WHERE id = ?")
        .bind("submission-rich")
        .run(),
    ).resolves.toBeDefined();
    await expect(
      env.DB.prepare(
        "UPDATE submissions SET status = 'revision_requested' WHERE id = ?",
      )
        .bind("submission-code")
        .run(),
    ).resolves.toBeDefined();

    await env.DB.prepare(
      `INSERT INTO submissions
        (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, idempotency_key, created_at, updated_at)
       VALUES (?, 'member-upgrade', 'default', NULL, 'rich_text', 'draft', ?, ?, ?, ?, ?)`,
    )
      .bind("submission-keyed", "Keyed", "body", "same-key", now, now)
      .run();
    await expect(
      env.DB.prepare(
        `INSERT INTO submissions
          (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, idempotency_key, created_at, updated_at)
         VALUES (?, 'member-upgrade', 'default', NULL, 'text', 'draft', ?, ?, ?, ?, ?)`,
      )
        .bind("submission-duplicate", "Duplicate", "body", "same-key", now, now)
        .run(),
    ).rejects.toThrow();

    const submissionIndexes = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'index'
         AND name IN ('submissions_owner_page', 'submissions_admin_page', 'submissions_idempotency')
       ORDER BY name`,
    ).all<{ name: string }>();
    expect(submissionIndexes.results).toEqual([
      { name: "submissions_admin_page" },
      { name: "submissions_idempotency" },
      { name: "submissions_owner_page" },
    ]);

    const foreignKeyViolations = await env.DB.prepare(
      "PRAGMA foreign_key_check",
    ).all();
    expect(foreignKeyViolations.results).toEqual([]);

    await applyD1Migrations(env.DB, MIGRATIONS);
    await expect(
      env.DB.prepare("SELECT count(*) AS count FROM submissions").first(),
    ).resolves.toEqual({ count: 3 });
  });
});
