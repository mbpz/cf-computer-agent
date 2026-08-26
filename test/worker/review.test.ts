/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = "2026-08-26T12:00:00.000Z";

describe("knowledge review", () => {
  let contributor = "";
  let admin = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await seedReviewCorpus();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => new Date(NOW) });
    contributor = (await sessions.create((await members.findByIdentitySubject("subject-review-contributor"))!)).token;
    admin = (await sessions.create((await members.findByIdentitySubject("subject-review-admin"))!)).token;
  });

  it("returns new and to-read items only within the member visibility boundary", async () => {
    await env.DB.prepare("INSERT INTO knowledge_favorites (member_id, knowledge_item_id, created_at) VALUES ('review-contributor', 'knowledge-review-old', ?)")
      .bind(NOW).run();
    await env.DB.prepare("INSERT INTO knowledge_visits (member_id, knowledge_item_id, last_visited_at, visit_count) VALUES ('review-contributor', 'knowledge-review-old', '2026-08-19T00:00:00.000Z', 1)")
      .run();
    const response = await api("/api/knowledge/review?period=weekly", contributor);
    expect(response.status).toBe(200);
    const responseBody = await response.json() as Record<string, unknown>;
    expect(responseBody).toMatchObject({
      period: "weekly",
      from: "2026-08-20T00:00:00.000Z",
      to: "2026-08-27T00:00:00.000Z",
      items: [
        { knowledgeItemId: "knowledge-review-old", reason: "to_read", favorite: true },
        { knowledgeItemId: "knowledge-review-new", reason: "new", favorite: false },
      ],
    });
    const body = responseBody as { items: Array<{ knowledgeItemId: string }> };
    expect(body.items.some((item) => item.knowledgeItemId === "knowledge-review-admin")).toBe(false);
  });

  it("allows an admin to review admin-only knowledge and rejects invalid periods", async () => {
    const response = await api("/api/knowledge/review?period=weekly", admin);
    expect(response.status).toBe(200);
    const adminBody = await response.json() as { items: Array<{ knowledgeItemId: string }> };
    expect(adminBody.items.map((item) => item.knowledgeItemId)).toContain("knowledge-review-admin");
    expect((await api("/api/knowledge/review?period=monthly", contributor)).status).toBe(400);
    expect((await api("/api/knowledge/review?period=daily&extra=1", contributor)).status).toBe(400);
  });

  it("does not expose review data after the member is disabled", async () => {
    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = 'review-contributor'").run();
    const response = await api("/api/knowledge/review?period=daily", contributor);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "MEMBER_DISABLED" } });
  });
});

async function api(path: string, token: string): Promise<Response> {
  const headers = new Headers({ cookie: "__Host-memory-session=" + token, origin: "https://memory.crgmhrc.asia" });
  const context = createExecutionContext();
  const response = await createApp().fetch!(new Request("https://memory.crgmhrc.asia" + path, { headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}

async function seedReviewCorpus(): Promise<void> {
  const hash = "c".repeat(64);
  await env.DB.prepare(
    `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
      ('review-contributor', 'subject-review-contributor', 'review-contributor@example.test', 'contributor', 'active', ?, ?),
      ('review-admin', 'subject-review-admin', 'review-admin@example.test', 'admin', 'active', ?, ?)`,
  ).bind(NOW, NOW, NOW, NOW).run();
  await env.DB.prepare(
    `INSERT INTO submissions (id, submitter_id, requested_space_id, kind, status, title, content, created_at, updated_at) VALUES
      ('review-submission-old', 'review-contributor', 'default', 'markdown', 'published', 'Old Guide', '# Old Guide', ?, ?),
      ('review-submission-new', 'review-contributor', 'default', 'markdown', 'published', 'New Guide', '# New Guide', ?, ?),
      ('review-submission-admin', 'review-admin', 'default', 'markdown', 'published', 'Admin Guide', '# Admin Guide', ?, ?)`,
  ).bind(NOW, NOW, NOW, NOW, NOW, NOW).run();
  await env.DB.prepare(
    `INSERT INTO sources (id, owner_id, space_id, kind, title, created_at, updated_at) VALUES
      ('review-source-old', 'review-contributor', 'default', 'markdown', 'Old Guide', ?, ?),
      ('review-source-new', 'review-contributor', 'default', 'markdown', 'New Guide', ?, ?),
      ('review-source-admin', 'review-admin', 'default', 'markdown', 'Admin Guide', ?, ?)`,
  ).bind(NOW, NOW, NOW, NOW, NOW, NOW).run();
  await env.DB.prepare(
    `INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES
      ('review-version-old', 'review-source-old', 'review-submission-old', 1, '# Old Guide', ?, 'm1-v1', ?),
      ('review-version-new', 'review-source-new', 'review-submission-new', 1, '# New Guide', ?, 'm1-v1', ?),
      ('review-version-admin', 'review-source-admin', 'review-submission-admin', 1, '# Admin Guide', ?, 'm1-v1', ?)`,
  ).bind(hash, NOW, hash, NOW, hash, NOW).run();
  await env.DB.prepare(
    `INSERT INTO knowledge_items (id, space_id, current_revision_id, status, search_status, created_at, updated_at) VALUES
      ('knowledge-review-old', 'default', NULL, 'active', 'indexed', ?, ?),
      ('knowledge-review-new', 'default', NULL, 'active', 'indexed', ?, ?),
      ('knowledge-review-admin', 'default', NULL, 'active', 'indexed', ?, ?)`,
  ).bind(NOW, NOW, NOW, NOW, NOW, NOW).run();
  await env.DB.prepare(
    `INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES
      ('review-revision-old', 'knowledge-review-old', 'review-version-old', '/workspace/published/default/knowledge-review-old/revision.md', ?, 'Old Guide', '[]', 'shared', 'review-contributor', '2026-08-10T00:00:00.000Z'),
      ('review-revision-new', 'knowledge-review-new', 'review-version-new', '/workspace/published/default/knowledge-review-new/revision.md', ?, 'New Guide', '[]', 'shared', 'review-contributor', '2026-08-25T00:00:00.000Z'),
      ('review-revision-admin', 'knowledge-review-admin', 'review-version-admin', '/workspace/published/default/knowledge-review-admin/revision.md', ?, 'Admin Guide', '[]', 'admin_only', 'review-admin', '2026-08-25T00:00:00.000Z')`,
  ).bind(hash, hash, hash).run();
  await env.DB.batch([
    env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'review-revision-old' WHERE id = 'knowledge-review-old'"),
    env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'review-revision-new' WHERE id = 'knowledge-review-new'"),
    env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'review-revision-admin' WHERE id = 'knowledge-review-admin'"),
  ]);
}
