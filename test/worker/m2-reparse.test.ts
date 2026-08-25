/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { APP_CONFIG } from "../../src/config";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";

const now = "2026-08-26T00:00:00.000Z";
let adminCookie = "";

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, MIGRATIONS);
  await env.DB.prepare(
    "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('m2-admin', 'github:m2-admin', 'm2-admin@example.test', 'admin', 'active', ?, ?)",
  ).bind(now, now).run();
  await env.DB.prepare(
    "INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, created_at, updated_at) VALUES ('m2-submission', 'm2-admin', 'default', NULL, 'markdown', 'published', 'M2 source', 'Original body', ?, ?)",
  ).bind(now, now).run();
  await env.DB.prepare(
    "INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES ('m2-source', 'm2-admin', 'default', NULL, 'markdown', 'M2 source', ?, ?)",
  ).bind(now, now).run();
  await env.DB.prepare(
    "INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, parser_schema_version, source_identity_sha256, created_at) VALUES ('m2-source-version', 'm2-source', 'm2-submission', 1, 'Original body', ?, 'm1-v1', 'm1-v2', ?, ?)",
  ).bind("a".repeat(64), "b".repeat(64), now).run();
  await env.DB.prepare(
    "INSERT INTO knowledge_items (id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('m2-item', 'default', NULL, NULL, 'active', 'indexed', ?, ?)",
  ).bind(now, now).run();
  await env.DB.prepare(
    "INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES ('m2-revision', 'm2-item', 'm2-source-version', '/workspace/published/default/m2-item/m2-revision.md', ?, 'M2 source', '[]', 'shared', 'm2-admin', ?)",
  ).bind("a".repeat(64), now).run();
  await env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'm2-revision' WHERE id = 'm2-item'").run();
  const sessions = new SessionService(env.DB, new MembersRepository(env.DB), { waitUntil: () => undefined });
  adminCookie = (await sessions.create({
    id: "m2-admin", identitySubject: "github:m2-admin", email: "m2-admin@example.test",
    role: "admin", status: "active", createdAt: now, updatedAt: now, lastSeenAt: null,
  })).token;
});

describe("M2 source reparse schema", () => {
  it("stores bounded reparse jobs while preserving immutable source_versions", async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('source_reparse_jobs', 'source_versions') ORDER BY name",
    ).all<{ name: string }>();
    expect(tables.results).toEqual([
      { name: "source_reparse_jobs" },
      { name: "source_versions" },
    ]);

    const sourceSchema = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'source_versions'",
    ).first<{ sql: string }>();
    expect(sourceSchema?.sql).toContain("UNIQUE(source_id, ordinal)");
    expect(sourceSchema?.sql).toContain("submission_id TEXT NOT NULL UNIQUE");

    const jobColumns = await env.DB.prepare("PRAGMA table_info('source_reparse_jobs')").all<{ name: string }>();
    expect(jobColumns.results.map((column) => column.name)).toEqual([
      "id", "source_id", "base_source_version_id", "submission_id", "requested_by", "parser_version",
      "parser_schema_version", "source_fingerprint", "status", "attempts", "candidate_content",
      "candidate_content_sha256", "candidate_source_identity_sha256", "candidate_code_metadata",
      "candidate_ordinal", "candidate_line_count", "candidate_created_at", "last_error_code", "created_at", "updated_at",
    ]);
  });

  it("exposes an admin reparse vertical slice without replacing the published source version", async () => {
    const response = await execute(new Request("https://example.test/api/admin/source-versions/m2-source-version/reparse", {
      method: "POST",
      headers: { cookie: `__Host-memory-session=${adminCookie}`, origin: APP_CONFIG.canonicalOrigin },
    }));
    expect(response.status).toBe(200);
    const body = await response.json<{ job: { id: string; status: string; parserVersion: string; candidate?: { content: string } } }>();
    expect(body.job).toMatchObject({ status: "indexed", parserVersion: "m2-v1", candidate: { content: "Original body" } });
    await expect(env.DB.prepare("SELECT content, parser_version FROM source_versions WHERE id = 'm2-source-version'").first())
      .resolves.toEqual({ content: "Original body", parser_version: "m1-v1" });
    const status = await execute(new Request(`https://example.test/api/admin/reparse-jobs/${body.job.id}`, {
      headers: { cookie: `__Host-memory-session=${adminCookie}` },
    }));
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({ job: { status: "indexed" } });

    const promoted = await execute(new Request(`https://example.test/api/admin/reparse-jobs/${body.job.id}/promote`, {
      method: "POST",
      headers: { cookie: `__Host-memory-session=${adminCookie}`, origin: APP_CONFIG.canonicalOrigin },
    }));
    expect(promoted.status).toBe(201);
    await expect(promoted.json()).resolves.toEqual({
      promotion: {
        submissionId: `${body.job.id}:submission`,
        sourceId: `${body.job.id}:source`,
        sourceVersionId: `${body.job.id}:source-version`,
      },
    });
    await expect(env.DB.prepare(
      "SELECT s.status, sv.parser_version, sv.parser_schema_version, old.source_version_id AS old_revision_source, old.content_sha256 AS old_hash FROM submissions s JOIN source_versions sv ON sv.submission_id = s.id JOIN revisions old ON old.source_version_id = 'm2-source-version' WHERE s.id = ?",
    ).bind(`${body.job.id}:submission`).first()).resolves.toEqual({
      status: "review_pending", parser_version: "m2-v1", parser_schema_version: "m2-v1",
      old_revision_source: "m2-source-version", old_hash: "a".repeat(64),
    });
    const replayPromotion = await execute(new Request(`https://example.test/api/admin/reparse-jobs/${body.job.id}/promote`, {
      method: "POST",
      headers: { cookie: `__Host-memory-session=${adminCookie}`, origin: APP_CONFIG.canonicalOrigin },
    }));
    expect(replayPromotion.status).toBe(201);
  });
});

async function execute(request: Request): Promise<Response> {
  const context = createExecutionContext();
  const response = await createApp().fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}
