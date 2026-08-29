/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { adminAssetRowsSql } from "../../src/assets/repository";
import { MIGRATIONS } from "../fixtures/d1";

interface TableColumn {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface IndexListEntry {
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

function sqlIdentifier(name: string): string {
  return name.replaceAll("'", "''");
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

async function queryPlan(sql: string, bindings: unknown[]): Promise<string> {
  const rows = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .bind(...bindings)
    .all<{ detail: string }>();
  return rows.results.map(({ detail }) => detail).join("\n");
}

async function expectTableSchema(
  name: string,
  expectedColumns: string[],
  expectedSqlFragments: string[] = [],
): Promise<void> {
  const object = await env.DB.prepare(
    "SELECT type, sql FROM sqlite_master WHERE name = ?",
  )
    .bind(name)
    .first<{ type: string; sql: string }>();
  expect(object?.type, `${name} object type`).toBe("table");

  const columns = await env.DB.prepare(
    `PRAGMA table_info('${sqlIdentifier(name)}')`,
  ).all<TableColumn>();
  expect(
    columns.results.map(
      ({ name: columnName, type, notnull, dflt_value, pk }) =>
        `${columnName}:${type}:${notnull}:${dflt_value ?? "NULL"}:${pk}`,
    ),
    `${name} columns`,
  ).toEqual(expectedColumns);

  const normalizedSql = normalizeSql(object?.sql ?? "");
  for (const fragment of expectedSqlFragments) {
    expect(normalizedSql, `${name} SQL`).toContain(normalizeSql(fragment));
  }
}

async function expectForeignKeys(
  table: string,
  expected: Array<{ from: string; table: string; to: string }>,
): Promise<void> {
  const keys = await env.DB.prepare(
    `PRAGMA foreign_key_list('${sqlIdentifier(table)}')`,
  ).all<{ from: string; table: string; to: string }>();
  expect(
    keys.results
      .map(({ from, table, to }) => ({ from, table, to }))
      .sort((left, right) => left.from.localeCompare(right.from)),
    `${table} foreign keys`,
  ).toEqual([...expected].sort((left, right) => left.from.localeCompare(right.from)));
}

async function expectIndex(
  table: string,
  name: string,
  expectedColumns: Array<{ name: string; desc: number }>,
  options: { unique?: number; partial?: number; sqlFragment?: string } = {},
): Promise<void> {
  const indexes = await env.DB.prepare(
    `PRAGMA index_list('${sqlIdentifier(table)}')`,
  ).all<IndexListEntry>();
  const index = indexes.results.find((candidate) => candidate.name === name);
  expect(index, `${name} index`).toBeTruthy();
  expect(
    { unique: index?.unique, partial: index?.partial },
    `${name} properties`,
  ).toEqual({
    unique: options.unique ?? 0,
    partial: options.partial ?? 0,
  });

  const columns = await env.DB.prepare(
    `PRAGMA index_xinfo('${sqlIdentifier(name)}')`,
  ).all<{ name: string; desc: number; key: number }>();
  expect(
    columns.results
      .filter(({ key }) => key === 1)
      .map(({ name: columnName, desc }) => ({ name: columnName, desc })),
    `${name} columns`,
  ).toEqual(expectedColumns);

  if (options.sqlFragment !== undefined) {
    const definition = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
    )
      .bind(name)
      .first<{ sql: string }>();
    expect(normalizeSql(definition?.sql ?? ""), `${name} SQL`).toContain(
      normalizeSql(options.sqlFragment),
    );
  }
}

async function expectUniqueConstraints(
  table: string,
  expected: string[],
): Promise<void> {
  const indexes = await env.DB.prepare(
    `PRAGMA index_list('${sqlIdentifier(table)}')`,
  ).all<IndexListEntry>();
  const actual = await Promise.all(
    indexes.results
      .filter(({ unique, origin }) => unique === 1 && origin !== "pk")
      .map(async ({ name, partial }) => {
        const columns = await env.DB.prepare(
          `PRAGMA index_info('${sqlIdentifier(name)}')`,
        ).all<{ name: string }>();
        return `${columns.results.map(({ name: columnName }) => columnName).join(",")}|partial=${partial}`;
      }),
  );
  expect(actual.sort(), `${table} unique constraints`).toEqual([...expected].sort());
}

describe("Phase 1 control-plane migrations", () => {
  beforeEach(async () => {
    await reset();
  });

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

    await expectTableSchema("submissions", [
      "id:TEXT:0:NULL:1",
      "submitter_id:TEXT:1:NULL:0",
      "requested_space_id:TEXT:1:NULL:0",
      "requested_collection_id:TEXT:0:NULL:0",
      "kind:TEXT:1:NULL:0",
      "status:TEXT:1:NULL:0",
      "title:TEXT:1:NULL:0",
      "content:TEXT:1:NULL:0",
      "idempotency_key:TEXT:0:NULL:0",
      "created_at:TEXT:1:NULL:0",
      "updated_at:TEXT:1:NULL:0",
      "supersedes_submission_id:TEXT:0:NULL:0",
      "requested_visibility:TEXT:1:'shared':0",
      "asset_id:TEXT:0:NULL:0",
    ], [
      "CHECK(kind IN ('text', 'markdown', 'code', 'rich_text'))",
      "CHECK(status IN ('draft', 'review_pending', 'published', 'rejected', 'revision_requested'))",
      "CHECK(requested_visibility IN ('shared', 'admin_only'))",
    ]);
    await expectTableSchema("sources", [
      "id:TEXT:0:NULL:1",
      "owner_id:TEXT:1:NULL:0",
      "space_id:TEXT:1:NULL:0",
      "collection_id:TEXT:0:NULL:0",
      "kind:TEXT:1:NULL:0",
      "title:TEXT:1:NULL:0",
      "created_at:TEXT:1:NULL:0",
      "updated_at:TEXT:1:NULL:0",
    ], ["CHECK(kind IN ('text', 'markdown', 'code'))"]);
    await expectTableSchema("source_versions", [
      "id:TEXT:0:NULL:1",
      "source_id:TEXT:1:NULL:0",
      "submission_id:TEXT:1:NULL:0",
      "ordinal:INTEGER:1:NULL:0",
      "content:TEXT:1:NULL:0",
      "content_sha256:TEXT:1:NULL:0",
      "parser_version:TEXT:1:NULL:0",
      "created_at:TEXT:1:NULL:0",
      "parser_schema_version:TEXT:1:'m1-v1':0",
      "source_identity_sha256:TEXT:0:NULL:0",
      "code_language:TEXT:0:NULL:0",
      "file_label:TEXT:0:NULL:0",
      "line_baseline:INTEGER:1:1:0",
    ], ["CHECK(ordinal > 0)"]);
    await expectTableSchema("tags", [
      "id:TEXT:0:NULL:1",
      "space_id:TEXT:1:NULL:0",
      "slug:TEXT:1:NULL:0",
      "name:TEXT:1:NULL:0",
      "status:TEXT:1:NULL:0",
      "created_at:TEXT:1:NULL:0",
      "updated_at:TEXT:1:NULL:0",
    ], ["CHECK(status IN ('active', 'disabled'))"]);
    await expectTableSchema("revision_tags", [
      "revision_id:TEXT:1:NULL:1",
      "tag_id:TEXT:1:NULL:2",
    ]);
    await expectTableSchema("reviews", [
      "id:TEXT:0:NULL:1",
      "submission_id:TEXT:1:NULL:0",
      "reviewer_id:TEXT:1:NULL:0",
      "decision:TEXT:1:NULL:0",
      "reason_code:TEXT:1:NULL:0",
      "reason:TEXT:1:'':0",
      "title:TEXT:1:NULL:0",
      "visibility:TEXT:1:NULL:0",
      "created_at:TEXT:1:NULL:0",
      "requested_title:TEXT:1:'':0",
      "requested_space_id:TEXT:0:NULL:0",
      "requested_collection_id:TEXT:0:NULL:0",
      "requested_visibility:TEXT:1:'shared':0",
      "final_space_id:TEXT:0:NULL:0",
      "final_collection_id:TEXT:0:NULL:0",
      "final_visibility:TEXT:0:NULL:0",
      "visibility_reason_code:TEXT:0:NULL:0",
    ], [
      "CHECK(decision IN ('published', 'rejected', 'revision_requested'))",
      "CHECK(visibility IN ('shared', 'admin_only'))",
    ]);
    await expectTableSchema("knowledge_items", [
      "id:TEXT:0:NULL:1",
      "space_id:TEXT:1:NULL:0",
      "collection_id:TEXT:0:NULL:0",
      "current_revision_id:TEXT:0:NULL:0",
      "status:TEXT:1:NULL:0",
      "search_status:TEXT:1:NULL:0",
      "created_at:TEXT:1:NULL:0",
      "updated_at:TEXT:1:NULL:0",
    ], [
      "CHECK(status IN ('active', 'trashed'))",
      "CHECK(search_status IN ('pending', 'indexed', 'search_degraded'))",
    ]);
    await expectTableSchema("revisions", [
      "id:TEXT:0:NULL:1",
      "knowledge_item_id:TEXT:1:NULL:0",
      "source_version_id:TEXT:1:NULL:0",
      "normalized_path:TEXT:1:NULL:0",
      "content_sha256:TEXT:1:NULL:0",
      "title:TEXT:1:NULL:0",
      "tags_json:TEXT:1:'[]':0",
      "visibility:TEXT:1:NULL:0",
      "published_by:TEXT:1:NULL:0",
      "published_at:TEXT:1:NULL:0",
      "summary:TEXT:1:'':0",
    ], ["CHECK(visibility IN ('shared', 'admin_only'))"]);
    await expectTableSchema("chunks", [
      "id:TEXT:0:NULL:1",
      "revision_id:TEXT:1:NULL:0",
      "ordinal:INTEGER:1:NULL:0",
      "heading_path:TEXT:1:NULL:0",
      "start_line:INTEGER:1:NULL:0",
      "end_line:INTEGER:1:NULL:0",
      "body:TEXT:1:NULL:0",
      "search_title:TEXT:1:NULL:0",
      "search_tags:TEXT:1:NULL:0",
      "search_body:TEXT:1:NULL:0",
      "index_field:TEXT:1:'body':0",
      "location_json:TEXT:1:'{}':0",
      "parent_chunk_id:TEXT:0:NULL:0",
      "status:TEXT:1:'active':0",
      "keywords_json:TEXT:1:'[]':0",
      "question_hints_json:TEXT:1:'[]':0",
    ], [
      "CHECK(ordinal >= 0)",
      "CHECK(start_line > 0)",
      "CHECK(end_line >= start_line)",
      "CHECK(index_field IN ('body', 'code'))",
    ]);
    await expectTableSchema("publication_intents", [
      "submission_id:TEXT:0:NULL:1",
      "revision_id:TEXT:1:NULL:0",
      "knowledge_item_id:TEXT:1:NULL:0",
      "reviewer_id:TEXT:1:NULL:0",
      "title:TEXT:1:NULL:0",
      "visibility:TEXT:1:NULL:0",
      "tags_json:TEXT:1:NULL:0",
      "normalized_path:TEXT:1:NULL:0",
      "content_sha256:TEXT:1:NULL:0",
      "state:TEXT:1:NULL:0",
      "created_at:TEXT:1:NULL:0",
      "updated_at:TEXT:1:NULL:0",
      "space_id:TEXT:0:NULL:0",
      "collection_id:TEXT:0:NULL:0",
      "visibility_reason_code:TEXT:0:NULL:0",
    ], [
      "CHECK(visibility IN ('shared', 'admin_only'))",
      "CHECK(state IN ('pending_content', 'content_written', 'completed', 'failed_terminal'))",
      "CHECK(visibility_reason_code IS NULL OR visibility_reason_code = 'admin_visibility_expansion')",
    ]);
    await expectTableSchema("jobs", [
      "id:TEXT:0:NULL:1",
      "kind:TEXT:1:NULL:0",
      "resource_id:TEXT:1:NULL:0",
      "state:TEXT:1:NULL:0",
      "attempts:INTEGER:1:0:0",
      "available_at:TEXT:1:NULL:0",
      "last_error_code:TEXT:0:NULL:0",
      "created_at:TEXT:1:NULL:0",
      "updated_at:TEXT:1:NULL:0",
      "lease_token:TEXT:0:NULL:0",
      "lease_expires_at:TEXT:0:NULL:0",
    ], [
      "CHECK(kind IN ('index_revision'))",
      "CHECK(state IN ('pending', 'running', 'completed', 'failed_retryable', 'failed_terminal'))",
      "CHECK(attempts >= 0)",
    ]);
    await expectTableSchema("chunks_fts", [
      "chunk_id::0:NULL:0",
      "title::0:NULL:0",
      "summary::0:NULL:0",
      "tags::0:NULL:0",
      "body::0:NULL:0",
      "code::0:NULL:0",
    ], [
      "CREATE VIRTUAL TABLE chunks_fts USING fts5",
      "chunk_id UNINDEXED",
      "tokenize='unicode61 remove_diacritics 2'",
    ]);
    await expectTableSchema("chunks_fts_shared", [
      "chunk_id::0:NULL:0",
      "title::0:NULL:0",
      "summary::0:NULL:0",
      "tags::0:NULL:0",
      "body::0:NULL:0",
      "code::0:NULL:0",
    ], [
      "CREATE VIRTUAL TABLE chunks_fts_shared USING fts5",
      "chunk_id UNINDEXED",
      "tokenize='unicode61 remove_diacritics 2'",
    ]);

    await expectForeignKeys("submissions", [
      { from: "submitter_id", table: "members", to: "id" },
      { from: "requested_space_id", table: "spaces", to: "id" },
      { from: "requested_collection_id", table: "collections", to: "id" },
      { from: "supersedes_submission_id", table: "submissions", to: "id" },
      { from: "asset_id", table: "assets", to: "id" },
    ]);
    await expectForeignKeys("sources", [
      { from: "owner_id", table: "members", to: "id" },
      { from: "space_id", table: "spaces", to: "id" },
      { from: "collection_id", table: "collections", to: "id" },
    ]);
    await expectForeignKeys("source_versions", [
      { from: "source_id", table: "sources", to: "id" },
      { from: "submission_id", table: "submissions", to: "id" },
    ]);
    await expectForeignKeys("tags", [
      { from: "space_id", table: "spaces", to: "id" },
    ]);
    await expectForeignKeys("revision_tags", [
      { from: "revision_id", table: "revisions", to: "id" },
      { from: "tag_id", table: "tags", to: "id" },
    ]);
    await expectForeignKeys("reviews", [
      { from: "submission_id", table: "submissions", to: "id" },
      { from: "reviewer_id", table: "members", to: "id" },
      { from: "requested_space_id", table: "spaces", to: "id" },
      { from: "requested_collection_id", table: "collections", to: "id" },
      { from: "final_space_id", table: "spaces", to: "id" },
      { from: "final_collection_id", table: "collections", to: "id" },
    ]);
    await expectForeignKeys("knowledge_items", [
      { from: "space_id", table: "spaces", to: "id" },
      { from: "collection_id", table: "collections", to: "id" },
      { from: "current_revision_id", table: "revisions", to: "id" },
    ]);
    await expectForeignKeys("revisions", [
      { from: "knowledge_item_id", table: "knowledge_items", to: "id" },
      { from: "source_version_id", table: "source_versions", to: "id" },
      { from: "published_by", table: "members", to: "id" },
    ]);
    await expectForeignKeys("chunks", [
      { from: "revision_id", table: "revisions", to: "id" },
      { from: "parent_chunk_id", table: "chunks", to: "id" },
    ]);
    await expectForeignKeys("publication_intents", [
      { from: "submission_id", table: "submissions", to: "id" },
      { from: "reviewer_id", table: "members", to: "id" },
      { from: "space_id", table: "spaces", to: "id" },
      { from: "collection_id", table: "collections", to: "id" },
    ]);
    await expectForeignKeys("jobs", []);

    await expectUniqueConstraints("submissions", [
      "asset_id|partial=1",
      "submitter_id,idempotency_key|partial=1",
    ]);
    await expectUniqueConstraints("sources", []);
    await expectUniqueConstraints("source_versions", [
      "submission_id|partial=0",
      "source_id,ordinal|partial=0",
    ]);
    await expectUniqueConstraints("tags", ["space_id,slug|partial=0"]);
    await expectUniqueConstraints("revision_tags", []);
    await expectUniqueConstraints("reviews", ["submission_id|partial=0"]);
    await expectUniqueConstraints("knowledge_items", []);
    await expectUniqueConstraints("revisions", [
      "source_version_id|partial=0",
      "normalized_path|partial=0",
    ]);
    await expectUniqueConstraints("chunks", ["revision_id,ordinal|partial=0"]);
    await expectUniqueConstraints("publication_intents", [
      "revision_id|partial=0",
      "normalized_path|partial=0",
    ]);
    await expectUniqueConstraints("jobs", ["kind,resource_id|partial=0"]);

    await expectIndex("knowledge_items", "knowledge_items_current_page", [
      { name: "status", desc: 0 },
      { name: "updated_at", desc: 1 },
      { name: "id", desc: 1 },
    ]);
    await expectIndex("knowledge_items", "knowledge_items_space_page", [
      { name: "status", desc: 0 },
      { name: "space_id", desc: 0 },
      { name: "updated_at", desc: 1 },
      { name: "id", desc: 1 },
    ]);
    await expectIndex("knowledge_items", "knowledge_items_degraded_scope", [
      { name: "status", desc: 0 },
      { name: "search_status", desc: 0 },
      { name: "space_id", desc: 0 },
      { name: "id", desc: 0 },
    ]);
    await expectIndex("sources", "sources_owner_page", [
      { name: "owner_id", desc: 0 },
      { name: "updated_at", desc: 1 },
      { name: "id", desc: 1 },
    ]);
    await expectIndex("source_versions", "source_versions_content_sha256", [
      { name: "content_sha256", desc: 0 },
      { name: "created_at", desc: 0 },
      { name: "id", desc: 0 },
    ]);
    await expectIndex("submissions", "submissions_owner_status_page", [
      { name: "submitter_id", desc: 0 },
      { name: "status", desc: 0 },
      { name: "created_at", desc: 1 },
      { name: "id", desc: 1 },
    ]);
    await expectIndex("reviews", "reviews_final_target_lookup", [
      { name: "final_space_id", desc: 0 },
      { name: "final_collection_id", desc: 0 },
      { name: "final_visibility", desc: 0 },
      { name: "created_at", desc: 1 },
      { name: "id", desc: 1 },
    ]);
    await expectIndex("revision_tags", "revision_tags_tag_revision", [
      { name: "tag_id", desc: 0 },
      { name: "revision_id", desc: 0 },
    ]);
    await expectIndex("revisions", "revisions_knowledge_item_cleanup", [
      { name: "knowledge_item_id", desc: 0 },
      { name: "id", desc: 0 },
    ]);
    await expectIndex("knowledge_items", "knowledge_items_current_revision_index_status", [
      { name: "current_revision_id", desc: 0 },
      { name: "search_status", desc: 0 },
      { name: "status", desc: 0 },
    ]);
    await expectIndex("chunks", "chunks_revision", [
      { name: "revision_id", desc: 0 },
      { name: "ordinal", desc: 0 },
    ]);
    await expectIndex("chunks", "chunks_parent_lookup", [
      { name: "parent_chunk_id", desc: 0 },
      { name: "revision_id", desc: 0 },
      { name: "ordinal", desc: 0 },
    ]);
    await expectIndex("chunks", "chunks_revision_status", [
      { name: "revision_id", desc: 0 },
      { name: "status", desc: 0 },
      { name: "ordinal", desc: 0 },
      { name: "id", desc: 0 },
    ]);
    await expectIndex("publication_intents", "publication_intents_pending", [
      { name: "state", desc: 0 },
      { name: "updated_at", desc: 0 },
      { name: "submission_id", desc: 0 },
    ]);
    await expectIndex("jobs", "jobs_recoverable_scan", [
      { name: "kind", desc: 0 },
      { name: "available_at", desc: 0 },
      { name: "id", desc: 0 },
    ], {
      partial: 1,
      sqlFragment: "WHERE state IN ('pending', 'running', 'failed_retryable')",
    });
    await expectIndex("tags", "tags_active_page", [
      { name: "space_id", desc: 0 },
      { name: "created_at", desc: 1 },
      { name: "id", desc: 1 },
    ], {
      partial: 1,
      sqlFragment: "WHERE status = 'active'",
    });
    await expectIndex("submissions", "submissions_owner_page", [
      { name: "submitter_id", desc: 0 },
      { name: "created_at", desc: 1 },
      { name: "id", desc: 1 },
    ]);
    await expectIndex("submissions", "submissions_admin_page", [
      { name: "status", desc: 0 },
      { name: "created_at", desc: 1 },
      { name: "id", desc: 1 },
    ]);
    await expectIndex(
      "submissions",
      "submissions_idempotency",
      [
        { name: "submitter_id", desc: 0 },
        { name: "idempotency_key", desc: 0 },
      ],
      {
        unique: 1,
        partial: 1,
        sqlFragment: "WHERE idempotency_key IS NOT NULL",
      },
    );

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

    await env.DB.prepare(
      `INSERT INTO submissions
        (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, created_at, updated_at)
       VALUES ('submission-fk', 'member-admin', 'default', NULL, 'text', 'draft', 'FK seed', 'body', ?, ?)`,
    )
      .bind(now, now)
      .run();
    await env.DB.prepare(
      `INSERT INTO sources
        (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at)
       VALUES ('source-fk', 'member-admin', 'default', NULL, 'text', 'FK seed', ?, ?)`,
    )
      .bind(now, now)
      .run();
    await env.DB.prepare(
      `INSERT INTO source_versions
        (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at)
       VALUES ('source-version-fk', 'source-fk', 'submission-fk', 1, 'body', 'hash', 'm1-v1', ?)`,
    )
      .bind(now)
      .run();
    await env.DB.prepare(
      `INSERT INTO knowledge_items
        (id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at)
       VALUES ('knowledge-item-fk', 'default', NULL, NULL, 'active', 'pending', ?, ?)`,
    )
      .bind(now, now)
      .run();

    await expect(
      env.DB.prepare(
        "INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, visibility, published_by, published_at) VALUES ('revision-missing-item', 'missing', 'source-version-fk', '/missing-item', 'h', 't', 'shared', 'member-admin', ?)",
      )
        .bind(now)
        .run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(
        "INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, visibility, published_by, published_at) VALUES ('revision-missing-version', 'knowledge-item-fk', 'missing', '/missing-version', 'h', 't', 'shared', 'member-admin', ?)",
      )
        .bind(now)
        .run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(
        "INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, visibility, published_by, published_at) VALUES ('revision-missing-publisher', 'knowledge-item-fk', 'source-version-fk', '/missing-publisher', 'h', 't', 'shared', 'missing', ?)",
      )
        .bind(now)
        .run(),
    ).rejects.toThrow();

    await env.DB.prepare(
      "INSERT INTO chunks_fts (chunk_id, title, summary, tags, body, code) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind("chunk-1", "Migration Garden", "schema summary", "m1 schema", "searchable knowledge", "")
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
    await env.DB.prepare(
      `INSERT INTO collections
        (id, space_id, parent_id, name, description, status, position, created_at, updated_at)
       VALUES ('collection-upgrade', 'default', NULL, 'Upgrade collection', 'preserved relation', 'active', 7, ?, ?)`,
    )
      .bind(now, now)
      .run();

    const legacyRows = [
      {
        id: "submission-rich",
        submitter_id: "member-upgrade",
        requested_space_id: "default",
        requested_collection_id: "collection-upgrade",
        kind: "rich_text",
        status: "rejected",
        title: "Rich legacy row",
        content: "<p>Line one</p>\r\n<p>记忆花园 🧠 &amp; exact bytes</p>",
        created_at: "2026-08-20T23:59:58.001Z",
        updated_at: "2026-08-21T00:59:58.002Z",
      },
      {
        id: "submission-code",
        submitter_id: "member-upgrade",
        requested_space_id: "default",
        requested_collection_id: null,
        kind: "code",
        status: "draft",
        title: "Code legacy row",
        content: "export const answer = 42;\n",
        created_at: "2026-08-20T22:58:57.003Z",
        updated_at: "2026-08-21T00:58:57.004Z",
      },
    ] as const;
    for (const row of legacyRows) {
      await env.DB.prepare(
        `INSERT INTO submissions
          (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          row.id,
          row.submitter_id,
          row.requested_space_id,
          row.requested_collection_id,
          row.kind,
          row.status,
          row.title,
          row.content,
          row.created_at,
          row.updated_at,
        )
        .run();
    }

    const legacyColumns = `id, submitter_id, requested_space_id,
      requested_collection_id, kind, status, title, content, created_at, updated_at`;
    const rowsBefore = await env.DB.prepare(
      `SELECT ${legacyColumns} FROM submissions ORDER BY id`,
    ).all<{
      id: string;
      submitter_id: string;
      requested_space_id: string;
      requested_collection_id: string | null;
      kind: string;
      status: string;
      title: string;
      content: string;
      created_at: string;
      updated_at: string;
    }>();
    const expectedLegacyRows = [...legacyRows].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    expect(rowsBefore.results).toEqual(expectedLegacyRows);
    const bytesBefore = await env.DB.prepare(
      "SELECT id, hex(content) AS content_hex FROM submissions ORDER BY id",
    ).all<{ id: string; content_hex: string }>();

    await applyD1Migrations(env.DB, MIGRATIONS);

    const upgradedRows = await env.DB.prepare(
      `SELECT ${legacyColumns}, idempotency_key
       FROM submissions ORDER BY id`,
    ).all<{
      id: string;
      submitter_id: string;
      requested_space_id: string;
      requested_collection_id: string | null;
      kind: string;
      status: string;
      title: string;
      content: string;
      created_at: string;
      updated_at: string;
      idempotency_key: string | null;
    }>();
    expect(upgradedRows.results).toEqual(
      expectedLegacyRows.map((row) => ({ ...row, idempotency_key: null })),
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

  it("upgrades the complete M1 record graph without fabricating review metadata", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS.slice(0, 3));
    const now = "2026-08-22T00:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-0004', 'github:0004', 'member-0004@example.test', 'admin', 'active', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO auth_sessions (token_hash, member_id, created_at, expires_at, last_seen_at) VALUES ('session-0004', 'member-0004', ?, ?, ?)").bind(now, "2026-08-23T00:00:00.000Z", now),
      env.DB.prepare("INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at) VALUES ('collection-0004', 'default', NULL, 'Collection', '', 'active', 1, ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, created_at, updated_at) VALUES ('submission-0004', 'member-0004', 'default', 'collection-0004', 'code', 'published', 'Requested title', 'const visible = true;', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES ('source-0004', 'member-0004', 'default', 'collection-0004', 'code', 'Requested title', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('source-version-0004', 'source-0004', 'submission-0004', 1, '```ts\\nconst visible = true;\\n```\\n', 'content-hash-0004', 'm1-v1', ?)").bind(now),
      env.DB.prepare("INSERT INTO reviews (id, submission_id, reviewer_id, decision, reason_code, reason, title, visibility, created_at) VALUES ('review-0004', 'submission-0004', 'member-0004', 'published', 'approved', '', 'Final title', 'admin_only', ?)").bind(now),
      env.DB.prepare("INSERT INTO knowledge_items (id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('item-0004', 'default', 'collection-0004', NULL, 'active', 'indexed', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES ('revision-0004', 'item-0004', 'source-version-0004', '/0004.md', 'content-hash-0004', 'Final title', '[\"tag-0004\"]', 'admin_only', 'member-0004', ?)").bind(now),
      env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'revision-0004' WHERE id = 'item-0004'"),
      env.DB.prepare("INSERT INTO tags (id, space_id, slug, name, status, created_at, updated_at) VALUES ('tag-0004', 'default', 'schema', 'Schema', 'disabled', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO revision_tags (revision_id, tag_id) VALUES ('revision-0004', 'tag-0004')"),
      env.DB.prepare("INSERT INTO chunks (id, revision_id, ordinal, heading_path, start_line, end_line, body, search_title, search_tags, search_body) VALUES ('chunk-0004', 'revision-0004', 0, '[]', 1, 1, 'visible body', 'Final title', 'Schema', 'visible body')"),
      env.DB.prepare("INSERT INTO chunks_fts (chunk_id, title, tags, body) VALUES ('chunk-0004', 'Final title', 'Schema', 'visible body')"),
      env.DB.prepare("INSERT INTO jobs (id, kind, resource_id, state, attempts, available_at, last_error_code, created_at, updated_at) VALUES ('job-0004', 'index_revision', 'revision-0004', 'completed', 1, ?, NULL, ?, ?)").bind(now, now, now),
      env.DB.prepare("INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at) VALUES ('collection-disabled-0004', 'default', NULL, 'Disabled', '', 'disabled', 2, ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, created_at, updated_at) VALUES ('submission-disabled-0004', 'member-0004', 'default', 'collection-disabled-0004', 'markdown', 'published', 'Disabled', 'disabledcorpus', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES ('source-disabled-0004', 'member-0004', 'default', 'collection-disabled-0004', 'markdown', 'Disabled', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('source-version-disabled-0004', 'source-disabled-0004', 'submission-disabled-0004', 1, 'disabledcorpus', 'disabled-hash-0004', 'm1-v1', ?)").bind(now),
      env.DB.prepare("INSERT INTO knowledge_items (id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('item-disabled-0004', 'default', 'collection-disabled-0004', NULL, 'active', 'indexed', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES ('revision-disabled-0004', 'item-disabled-0004', 'source-version-disabled-0004', '/disabled-0004.md', 'disabled-hash-0004', 'Disabled', '[]', 'shared', 'member-0004', ?)").bind(now),
      env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'revision-disabled-0004' WHERE id = 'item-disabled-0004'"),
      env.DB.prepare("INSERT INTO chunks (id, revision_id, ordinal, heading_path, start_line, end_line, body, search_title, search_tags, search_body) VALUES ('chunk-disabled-0004', 'revision-disabled-0004', 0, '[]', 1, 1, 'disabledcorpus', 'Disabled', '', 'disabledcorpus')"),
      env.DB.prepare("INSERT INTO jobs (id, kind, resource_id, state, attempts, available_at, last_error_code, created_at, updated_at) VALUES ('job-disabled-0004', 'index_revision', 'revision-disabled-0004', 'completed', 1, ?, NULL, ?, ?)").bind(now, now, now),
      env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, created_at, updated_at) VALUES ('submission-pending-0004', 'member-0004', 'default', NULL, 'markdown', 'published', 'Pending', 'pendingcorpus', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES ('source-pending-0004', 'member-0004', 'default', NULL, 'markdown', 'Pending', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('source-version-pending-0004', 'source-pending-0004', 'submission-pending-0004', 1, 'pendingcorpus', 'pending-hash-0004', 'm1-v1', ?)").bind(now),
      env.DB.prepare("INSERT INTO knowledge_items (id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('item-pending-0004', 'default', NULL, NULL, 'active', 'pending', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES ('revision-pending-0004', 'item-pending-0004', 'source-version-pending-0004', '/pending-0004.md', 'pending-hash-0004', 'Pending', '[]', 'shared', 'member-0004', ?)").bind(now),
      env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'revision-pending-0004' WHERE id = 'item-pending-0004'"),
      env.DB.prepare("INSERT INTO chunks (id, revision_id, ordinal, heading_path, start_line, end_line, body, search_title, search_tags, search_body) VALUES ('chunk-pending-0004', 'revision-pending-0004', 0, '[]', 1, 1, 'pendingcorpus', 'Pending', '', 'pendingcorpus')"),
      env.DB.prepare("INSERT INTO jobs (id, kind, resource_id, state, attempts, available_at, last_error_code, created_at, updated_at) VALUES ('job-pending-0004', 'index_revision', 'revision-pending-0004', 'pending', 0, ?, NULL, ?, ?)").bind(now, now, now),
    ]);

    await applyD1Migrations(env.DB, MIGRATIONS);

    await expect(env.DB.prepare("SELECT parser_schema_version, source_identity_sha256, code_language, file_label, line_baseline FROM source_versions WHERE id = 'source-version-0004'").first()).resolves.toEqual({ parser_schema_version: "m1-v1", source_identity_sha256: null, code_language: null, file_label: null, line_baseline: 1 });
    await expect(env.DB.prepare("SELECT requested_visibility FROM submissions WHERE id = 'submission-0004'").first()).resolves.toEqual({ requested_visibility: "shared" });
    await expect(env.DB.prepare("SELECT requested_title, requested_space_id, requested_collection_id, requested_visibility, final_space_id, final_collection_id, final_visibility FROM reviews WHERE id = 'review-0004'").first()).resolves.toEqual({ requested_title: "Requested title", requested_space_id: "default", requested_collection_id: "collection-0004", requested_visibility: "admin_only", final_space_id: "default", final_collection_id: "collection-0004", final_visibility: "admin_only" });
    await expect(env.DB.prepare("SELECT chunk_id, title, summary, tags, body, code FROM chunks_fts WHERE chunks_fts MATCH 'visible'").first()).resolves.toEqual({ chunk_id: "chunk-0004", title: "Final title", summary: "", tags: "", body: "", code: "visible body" });
    await expect(env.DB.prepare("SELECT count(*) AS count FROM chunks_fts WHERE chunks_fts MATCH 'disabledcorpus OR pendingcorpus'").first()).resolves.toEqual({ count: 0 });
    await expect(env.DB.prepare("SELECT count(*) AS count FROM chunks_fts_shared").first()).resolves.toEqual({ count: 0 });
    await expect(env.DB.prepare(
      "SELECT chunks_fts.rowid = chunks.rowid AS same_rowid FROM chunks_fts JOIN chunks ON chunks.id = chunks_fts.chunk_id WHERE chunks.id = 'chunk-0004'",
    ).first()).resolves.toEqual({ same_rowid: 1 });
    await expect(env.DB.prepare("SELECT m.id AS member_id, a.token_hash, s.id AS space_id, c.id AS collection_id, sub.id AS submission_id, sv.id AS source_version_id, r.id AS review_id, k.id AS item_id, rev.id AS revision_id, t.id AS tag_id, ch.id AS chunk_id, j.id AS job_id FROM members m JOIN auth_sessions a ON a.member_id = m.id JOIN spaces s ON s.id = 'default' JOIN collections c ON c.id = 'collection-0004' JOIN submissions sub ON sub.id = 'submission-0004' JOIN source_versions sv ON sv.submission_id = sub.id JOIN reviews r ON r.submission_id = sub.id JOIN knowledge_items k ON k.id = 'item-0004' JOIN revisions rev ON rev.id = k.current_revision_id JOIN revision_tags rt ON rt.revision_id = rev.id JOIN tags t ON t.id = rt.tag_id JOIN chunks ch ON ch.revision_id = rev.id JOIN jobs j ON j.resource_id = rev.id").first()).resolves.toEqual({ member_id: "member-0004", token_hash: "session-0004", space_id: "default", collection_id: "collection-0004", submission_id: "submission-0004", source_version_id: "source-version-0004", review_id: "review-0004", item_id: "item-0004", revision_id: "revision-0004", tag_id: "tag-0004", chunk_id: "chunk-0004", job_id: "job-0004" });
  });

  it("uses selective no-sort indexes for recovery jobs and active Tag keyset pages at scale shape", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS);
    const timestamp = "2026-08-21T03:04:05.006Z";
    await env.DB.prepare(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 500
       )
       INSERT INTO jobs (
         id, kind, resource_id, state, attempts, available_at, last_error_code, created_at, updated_at
       )
       SELECT printf('completed-job-%04d', value), 'index_revision', printf('completed-revision-%04d', value),
         'completed', 1, ?, NULL, ?, ?
       FROM sequence`,
    ).bind(timestamp, timestamp, timestamp).run();
    await env.DB.prepare(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 500
       )
       INSERT INTO tags (id, space_id, slug, name, status, created_at, updated_at)
       SELECT printf('active-tag-%04d', value), 'default', printf('active-tag-%04d', value),
         printf('Active Tag %04d', value), 'active', ?, ?
       FROM sequence`,
    ).bind(timestamp, timestamp).run();
    await env.DB.prepare("ANALYZE").run();

    const jobsPlan = await queryPlan(
      `SELECT resource_id FROM jobs
       WHERE kind = 'index_revision' AND state IN ('pending', 'running', 'failed_retryable')
         AND available_at <= ?
       ORDER BY available_at ASC, id ASC LIMIT ?`,
      [timestamp, 20],
    );
    const tagsPlan = await queryPlan(
      `SELECT t.id, t.space_id, t.slug, t.name, t.status, t.created_at, t.updated_at
       FROM tags t
       WHERE t.space_id = ? AND t.status = 'active'
         AND EXISTS (
           SELECT 1 FROM spaces s
           WHERE s.id = t.space_id AND s.status = 'active' AND s.kind != 'legacy'
         )
         AND (t.created_at < ? OR (t.created_at = ? AND t.id < ?))
       ORDER BY t.created_at DESC, t.id DESC LIMIT ?`,
      ["default", timestamp, timestamp, "active-tag-9999", 51],
    );
    const cleanupPlan = await queryPlan(
      `SELECT c.rowid
       FROM revisions stale
       JOIN chunks c ON c.revision_id = stale.id
       CROSS JOIN chunks_fts f
       WHERE stale.knowledge_item_id = ? AND stale.id != ? AND f.rowid = c.rowid
       LIMIT 257`,
      ["knowledge-cleanup", "revision-current"],
    );
    const ftsDeletePlan = await queryPlan(
      "DELETE FROM chunks_fts WHERE rowid = ?",
      [42],
    );
    const collectionInvalidationPlan = await queryPlan(
      `SELECT current_revision_id FROM knowledge_items
       WHERE status = 'active' AND current_revision_id IS NOT NULL AND collection_id = ?`,
      ["collection-scale"],
    );

    expect(jobsPlan).toContain("jobs_recoverable_scan");
    expect(jobsPlan).not.toMatch(/USE TEMP B-TREE/iu);
    expect(tagsPlan).toContain("tags_active_page");
    expect(tagsPlan).not.toMatch(/USE TEMP B-TREE/iu);
    expect(cleanupPlan).toContain("revisions_knowledge_item_cleanup");
    expect(cleanupPlan).toContain("chunks_revision");
    expect(cleanupPlan).toContain("VIRTUAL TABLE INDEX 0:=");
    expect(cleanupPlan).not.toMatch(/SCAN (?:stale|c)\b|USE TEMP B-TREE/iu);
    expect(ftsDeletePlan).toContain("VIRTUAL TABLE INDEX 0:=");
    expect(ftsDeletePlan).not.toMatch(/LIST SUBQUERY|USE TEMP B-TREE/iu);
    expect(collectionInvalidationPlan).toContain("knowledge_items_collection_reindex");
    expect(collectionInvalidationPlan).not.toMatch(/SCAN knowledge_items|USE TEMP B-TREE/iu);
  });

  it("uses no-sort indexes for formal admin asset and member task pages", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare("ANALYZE").run();

    const assetsPlan = await queryPlan(adminAssetRowsSql(false), [20, 200]);
    const statusAssetsPlan = await queryPlan(adminAssetRowsSql(true), ["queued", 20, 200]);
    const tasksPlan = await queryPlan(
      `SELECT id FROM tasks
       WHERE member_id = ?
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      ["member-page-plan", 20, 200],
    );

    expect(assetsPlan).toContain("assets_admin_page");
    expect(assetsPlan).not.toMatch(/USE TEMP B-TREE/iu);
    expect(statusAssetsPlan).toContain("assets_admin_page");
    expect(statusAssetsPlan).not.toMatch(/USE TEMP B-TREE/iu);
    expect(tasksPlan).toContain("tasks_member_page");
    expect(tasksPlan).not.toMatch(/USE TEMP B-TREE/iu);

    const timestamp = "2026-08-29T00:00:00.000Z";
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('asset-plan-owner', 'github:asset-plan-owner', 'asset-plan@example.test', 'contributor', 'active', ?, ?)",
    ).bind(timestamp, timestamp).run();
    for (const [id, createdAt, status] of [
      ["asset-plan-new", "2026-08-29T03:00:00.000Z", "queued"],
      ["asset-plan-middle", "2026-08-29T02:00:00.000Z", "failed_terminal"],
      ["asset-plan-old", "2026-08-29T01:00:00.000Z", "queued"],
    ] as const) {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO assets (id, owner_id, object_key, original_name, content_type, byte_size, content_sha256,
             idempotency_key, status, created_at, updated_at)
           VALUES (?, 'asset-plan-owner', ?, ?, 'text/plain', 1, ?, ?, 'ready', ?, ?)`,
        ).bind(id, `staging/${id}`, `${id}.txt`, id.padEnd(64, "0"), id, createdAt, createdAt),
        env.DB.prepare(
          `INSERT INTO parse_jobs (id, asset_id, status, attempts, created_at, updated_at)
           VALUES (?, ?, ?, 0, ?, ?)`,
        ).bind(`job-${id}`, id, status, createdAt, createdAt),
      ]);
    }
    const filteredCount = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM assets a JOIN parse_jobs j ON j.asset_id = a.id WHERE j.status = ?",
    ).bind("queued").first<{ total: number }>();
    const filteredRows = await env.DB.prepare(adminAssetRowsSql(true))
      .bind("queued", 20, 0).all<{ id: string; job_status: string }>();
    expect(filteredCount).toEqual({ total: 2 });
    expect(filteredRows.results.map(({ id, job_status }) => ({ id, job_status }))).toEqual([
      { id: "asset-plan-new", job_status: "queued" },
      { id: "asset-plan-old", job_status: "queued" },
    ]);
  });

  it("creates append-only review comments with bounded bodies and relationships", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS);
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'review_comments'",
    ).all<{ name: string }>();
    expect(tables.results).toEqual([{ name: "review_comments" }]);
    const indexes = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('review_comments_submission_created', 'review_comments_author_created') ORDER BY name",
    ).all<{ name: string }>();
    expect(indexes.results).toEqual([
      { name: "review_comments_author_created" },
      { name: "review_comments_submission_created" },
    ]);
    const timestamp = "2026-08-26T00:00:00.000Z";
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?)",
    ).bind("comment-owner", "github:comment-owner", "comment-owner@example.test", timestamp, timestamp).run();
    await env.DB.prepare(
      "INSERT INTO submissions (id, submitter_id, requested_space_id, kind, status, title, content, created_at, updated_at) VALUES (?, ?, 'default', 'text', 'review_pending', ?, ?, ?, ?)",
    ).bind("comment-submission", "comment-owner", "Commented", "Body", timestamp, timestamp).run();
    await env.DB.prepare(
      "INSERT INTO review_comments (id, submission_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind("comment-1", "comment-submission", "comment-owner", "First", timestamp).run();
    await expect(env.DB.prepare(
      "INSERT INTO review_comments (id, submission_id, author_id, body, created_at) VALUES ('comment-bad', 'comment-submission', 'comment-owner', '', ?)",
    ).bind(timestamp).run()).rejects.toThrow();
    await expect(env.DB.prepare(
      "INSERT INTO review_comments (id, submission_id, author_id, body, created_at) VALUES ('comment-orphan', 'missing', 'comment-owner', 'Orphan', ?)",
    ).bind(timestamp).run()).rejects.toThrow();
  });

  it("creates private favorites with indexes and purge-safe cascades", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS);
    await expectTableSchema("knowledge_favorites", [
      "member_id:TEXT:1:NULL:1",
      "knowledge_item_id:TEXT:1:NULL:2",
      "created_at:TEXT:1:NULL:0",
    ], []);
    await expectIndex("knowledge_favorites", "knowledge_favorites_member_page", [{ name: "member_id", desc: 0 }, { name: "created_at", desc: 1 }, { name: "knowledge_item_id", desc: 1 }]);
    const timestamp = "2026-08-26T00:00:00.000Z";
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('favorite-owner', 'github:favorite-owner', 'favorite-owner@example.test', 'contributor', 'active', ?, ?)",
    ).bind(timestamp, timestamp).run();
    await env.DB.prepare(
      "INSERT INTO knowledge_items (id, space_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('favorite-knowledge', 'default', NULL, 'active', 'indexed', ?, ?)",
    ).bind(timestamp, timestamp).run();
    await env.DB.prepare(
      "INSERT INTO knowledge_favorites (member_id, knowledge_item_id, created_at) VALUES ('favorite-owner', 'favorite-knowledge', ?)",
    ).bind(timestamp).run();
    await env.DB.prepare("DELETE FROM knowledge_items WHERE id = 'favorite-knowledge'").run();
    await expect(env.DB.prepare("SELECT count(*) AS count FROM knowledge_favorites WHERE knowledge_item_id = 'favorite-knowledge'").first()).resolves.toEqual({ count: 0 });
  });

  it("creates bounded recent visits with private member and knowledge cascades", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS);
    await expectTableSchema("knowledge_visits", [
      "member_id:TEXT:1:NULL:1",
      "knowledge_item_id:TEXT:1:NULL:2",
      "last_visited_at:TEXT:1:NULL:0",
      "visit_count:INTEGER:1:1:0",
    ], ["CHECK(visit_count >= 1)"]);
    await expectIndex("knowledge_visits", "knowledge_visits_member_page", [{ name: "member_id", desc: 0 }, { name: "last_visited_at", desc: 1 }, { name: "knowledge_item_id", desc: 1 }]);
    const timestamp = "2026-08-26T00:00:00.000Z";
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('recent-owner', 'github:recent-owner', 'recent-owner@example.test', 'contributor', 'active', ?, ?)").bind(timestamp, timestamp).run();
    await env.DB.prepare("INSERT INTO knowledge_items (id, space_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('recent-knowledge', 'default', NULL, 'active', 'indexed', ?, ?)").bind(timestamp, timestamp).run();
    await env.DB.prepare("INSERT INTO knowledge_visits (member_id, knowledge_item_id, last_visited_at) VALUES ('recent-owner', 'recent-knowledge', ?)").bind(timestamp).run();
    await expect(env.DB.prepare("INSERT INTO knowledge_visits (member_id, knowledge_item_id, last_visited_at, visit_count) VALUES ('recent-owner', 'recent-knowledge', ?, 0)").bind(timestamp).run()).rejects.toThrow();
    await env.DB.prepare("DELETE FROM knowledge_items WHERE id = 'recent-knowledge'").run();
    await expect(env.DB.prepare("SELECT count(*) AS count FROM knowledge_visits").first()).resolves.toEqual({ count: 0 });
  });

  it("creates private note shares with active-member boundaries and cascades", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS);
    await expectTableSchema("private_note_shares", [
      "note_id:TEXT:1:NULL:1",
      "recipient_member_id:TEXT:1:NULL:2",
      "created_at:TEXT:1:NULL:0",
      "revoked_at:TEXT:0:NULL:0",
    ], ["CHECK(revoked_at IS NULL OR revoked_at >= created_at)"]);
    await expectIndex("private_note_shares", "private_note_shares_recipient_page", [
      { name: "recipient_member_id", desc: 0 }, { name: "created_at", desc: 1 }, { name: "note_id", desc: 1 },
    ]);
    await expectIndex("private_note_shares", "private_note_shares_note_page", [
      { name: "note_id", desc: 0 }, { name: "revoked_at", desc: 0 }, { name: "recipient_member_id", desc: 0 },
    ]);
    await expectForeignKeys("private_note_shares", [
      { from: "note_id", table: "private_notes", to: "id" },
      { from: "recipient_member_id", table: "members", to: "id" },
    ]);
    const timestamp = "2026-08-26T00:00:00.000Z";
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('share-owner', 'github:share-owner', 'share-owner@example.test', 'contributor', 'active', ?, ?), ('share-recipient', 'github:share-recipient', 'share-recipient@example.test', 'contributor', 'active', ?, ?)").bind(timestamp, timestamp, timestamp, timestamp).run();
    await env.DB.prepare("INSERT INTO knowledge_items (id, space_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('share-knowledge', 'default', NULL, 'active', 'indexed', ?, ?)").bind(timestamp, timestamp).run();
    await env.DB.prepare("INSERT INTO private_notes (id, owner_member_id, knowledge_item_id, title, body, citations_json, created_at, updated_at) VALUES ('share-note', 'share-owner', 'share-knowledge', 'Shared', 'Body', '[]', ?, ?)").bind(timestamp, timestamp).run();
    await env.DB.prepare("INSERT INTO private_note_shares (note_id, recipient_member_id, created_at) VALUES ('share-note', 'share-recipient', ?)").bind(timestamp).run();
    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = 'share-recipient'").run();
    await expect(env.DB.prepare("INSERT INTO private_note_shares (note_id, recipient_member_id, created_at) VALUES ('share-note', 'share-recipient', ?)").bind(timestamp).run()).rejects.toThrow();
    await env.DB.prepare("DELETE FROM private_notes WHERE id = 'share-note'").run();
    await expect(env.DB.prepare("SELECT count(*) AS count FROM private_note_shares").first()).resolves.toEqual({ count: 0 });
  });

  it("creates the admin-owned duplicate candidate queue with guarded decisions", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS);
    await expectTableSchema("duplicate_candidates", [
      "submission_id:TEXT:0:NULL:1",
      "canonical_submission_id:TEXT:1:NULL:0",
      "canonical_source_id:TEXT:1:NULL:0",
      "canonical_source_version_id:TEXT:1:NULL:0",
      "decision:TEXT:1:'pending':0",
      "decided_by:TEXT:0:NULL:0",
      "decided_at:TEXT:0:NULL:0",
      "created_at:TEXT:1:NULL:0",
    ], ["CHECK(decision IN ('pending', 'associate', 'keep_separate', 'reject'))"]);
    await expectIndex("duplicate_candidates", "duplicate_candidates_queue", [
      { name: "decision", desc: 0 }, { name: "created_at", desc: 1 }, { name: "submission_id", desc: 1 },
    ]);
    await expectForeignKeys("duplicate_candidates", [
      { from: "submission_id", table: "submissions", to: "id" },
      { from: "canonical_submission_id", table: "submissions", to: "id" },
      { from: "canonical_source_id", table: "sources", to: "id" },
      { from: "canonical_source_version_id", table: "source_versions", to: "id" },
      { from: "decided_by", table: "members", to: "id" },
    ]);
  });

  it("creates privacy-safe site analytics dimensions and lookup indexes", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS);
    await expectTableSchema("site_visit_events", [
      "id:TEXT:0:NULL:1",
      "day:TEXT:1:NULL:0",
      "visit_bucket:TEXT:1:NULL:0",
      "path:TEXT:1:NULL:0",
      "visitor_hash:TEXT:1:NULL:0",
      "member_id:TEXT:0:NULL:0",
      "created_at:TEXT:1:NULL:0",
      "ip_display:TEXT:1:'unknown':0",
      "country:TEXT:0:NULL:0",
      "region:TEXT:0:NULL:0",
      "city:TEXT:0:NULL:0",
      "colo:TEXT:0:NULL:0",
      "user_agent:TEXT:0:NULL:0",
    ]);
    await expectIndex("site_visit_events", "site_visit_region_day", [
      { name: "country", desc: 0 },
      { name: "region", desc: 0 },
      { name: "day", desc: 0 },
      { name: "created_at", desc: 1 },
    ]);
    await expectIndex("site_visit_events", "site_visit_member_time", [
      { name: "member_id", desc: 0 },
      { name: "created_at", desc: 1 },
    ]);
  });

  it("groups knowledge and governance menus without exceeding four levels", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS);
    const rows = await env.DB.prepare(
      `SELECT id, parent_id, label_key, path, position
       FROM menus
       WHERE id IN ('menu-knowledge', 'menu-search', 'menu-agent', 'menu-admin',
         'menu-governance', 'menu-members', 'menu-roles', 'menu-menus',
         'menu-spaces', 'menu-audit', 'menu-analytics')
       ORDER BY id`,
    ).all<{ id: string; parent_id: string | null; label_key: string; path: string | null; position: number }>();
    expect(rows.results).toEqual([
      { id: "menu-admin", parent_id: null, label_key: "NAV_ADMINISTRATION", path: null, position: 1 },
      { id: "menu-agent", parent_id: "menu-knowledge", label_key: "NAV_KNOWLEDGE_AGENT", path: "/agent", position: 1 },
      { id: "menu-analytics", parent_id: "menu-governance", label_key: "NAV_SITE_ANALYTICS", path: "/admin/analytics", position: 5 },
      { id: "menu-audit", parent_id: "menu-governance", label_key: "NAV_AUDIT", path: "/admin/audit", position: 4 },
      { id: "menu-governance", parent_id: "menu-admin", label_key: "SHELL_GROUP_GOVERNANCE", path: null, position: 4 },
      { id: "menu-knowledge", parent_id: "menu-workspace", label_key: "NAV_KNOWLEDGE_BASE", path: "/knowledge", position: 1 },
      { id: "menu-members", parent_id: "menu-governance", label_key: "NAV_MEMBERS", path: "/admin/members", position: 0 },
      { id: "menu-menus", parent_id: "menu-governance", label_key: "NAV_MENUS", path: "/admin/menus", position: 2 },
      { id: "menu-roles", parent_id: "menu-governance", label_key: "NAV_ROLES", path: "/admin/roles", position: 1 },
      { id: "menu-search", parent_id: "menu-knowledge", label_key: "NAV_KNOWLEDGE_SEARCH", path: "/search", position: 0 },
      { id: "menu-spaces", parent_id: "menu-governance", label_key: "NAV_SPACES", path: "/admin/spaces", position: 3 },
    ]);
  });

  it("preserves existing analytics rows while applying the two workbench migrations", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS.slice(0, 29));
    const timestamp = "2026-08-27T01:02:03.000Z";
    await env.DB.prepare(
      `INSERT INTO site_visit_events (id, day, visit_bucket, path, visitor_hash, member_id, created_at)
       VALUES ('analytics-before-dimensions', '2026-08-27', '2026-08-27T01:00:00Z', '/', 'hash-before', NULL, ?)`,
    ).bind(timestamp).run();

    await applyD1Migrations(env.DB, MIGRATIONS);

    await expect(env.DB.prepare(
      "SELECT id, ip_display, country, region FROM site_visit_events WHERE id = 'analytics-before-dimensions'",
    ).first()).resolves.toEqual({
      id: "analytics-before-dimensions",
      ip_display: "unknown",
      country: null,
      region: null,
    });
  });

  it("aborts 0003 before schema changes when a legacy review_pending row has no SourceVersion", async () => {
    const priorMigrations = MIGRATIONS.slice(0, 2);
    await applyD1Migrations(env.DB, priorMigrations);
    const timestamp = "2026-08-21T02:03:04.005Z";
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-guard', 'github:guard', 'guard@example.test', 'contributor', 'active', ?, ?)",
    ).bind(timestamp, timestamp).run();
    for (const [id, status] of [
      ["legacy-draft", "draft"],
      ["legacy-pending", "review_pending"],
      ["legacy-rejected", "rejected"],
    ] as const) {
      await env.DB.prepare(
        `INSERT INTO submissions (
          id, submitter_id, requested_space_id, requested_collection_id, kind, status,
          title, content, created_at, updated_at
        ) VALUES (?, 'member-guard', 'default', NULL, 'text', ?, ?, ?, ?, ?)`,
      ).bind(id, status, id, `bytes:${id}`, timestamp, timestamp).run();
    }

    await expect(applyD1Migrations(env.DB, MIGRATIONS)).rejects.toThrow();
    await expect(env.DB.prepare(
      "SELECT id, status, content FROM submissions ORDER BY id",
    ).all()).resolves.toMatchObject({
      results: [
        { id: "legacy-draft", status: "draft", content: "bytes:legacy-draft" },
        { id: "legacy-pending", status: "review_pending", content: "bytes:legacy-pending" },
        { id: "legacy-rejected", status: "rejected", content: "bytes:legacy-rejected" },
      ],
    });
    await expect(env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE name IN ('sources', 'submissions_legacy') ORDER BY name",
    ).all()).resolves.toMatchObject({ results: [] });

    await env.DB.prepare(
      "UPDATE submissions SET status = 'rejected', updated_at = ? WHERE id = 'legacy-pending' AND status = 'review_pending'",
    ).bind(timestamp).run();
    await applyD1Migrations(env.DB, MIGRATIONS);

    await expect(env.DB.prepare(
      `SELECT count(*) AS count
       FROM submissions s
       LEFT JOIN source_versions sv ON sv.submission_id = s.id
       WHERE s.status = 'review_pending' AND sv.id IS NULL`,
    ).first()).resolves.toEqual({ count: 0 });
    await expect(env.DB.prepare(
      "SELECT id, status, content, idempotency_key FROM submissions ORDER BY id",
    ).all()).resolves.toMatchObject({
      results: [
        { id: "legacy-draft", status: "draft", content: "bytes:legacy-draft", idempotency_key: null },
        { id: "legacy-pending", status: "rejected", content: "bytes:legacy-pending", idempotency_key: null },
        { id: "legacy-rejected", status: "rejected", content: "bytes:legacy-rejected", idempotency_key: null },
      ],
    });
  });
});
