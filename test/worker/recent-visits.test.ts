/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import type { KnowledgeBase } from "../../src/index";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import type { RpcResult } from "../../src/knowledge/types";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = "2026-08-26T00:00:00.000Z";

describe("recent knowledge visits", () => {
  let sessionA = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await seedKnowledge();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => new Date(NOW) });
    sessionA = (await sessions.create((await members.findByIdentitySubject("subject-recent-a"))!)).token;
  });

  it("records successful detail reads, deduplicates counts, and paginates privately", async () => {
    expect((await api("/api/knowledge/knowledge-recent", sessionA)).status).toBe(200);
    expect((await api("/api/knowledge/knowledge-recent", sessionA)).status).toBe(200);
    const recent = await api("/api/knowledge/recent?limit=1", sessionA);
    expect(await recent.json()).toMatchObject({ items: [{ knowledgeItemId: "knowledge-recent", visitCount: 2 }] });
    expect((await api("/api/knowledge/recent?limit=0", sessionA)).status).toBe(400);
  });

  it("rejects a disabled member before recent-visit reads", async () => {
    await api("/api/knowledge/knowledge-recent", sessionA);
    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = 'recent-a'").run();
    const response = await api("/api/knowledge/recent", sessionA);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "MEMBER_DISABLED" } });
  });
});

async function api(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("cookie", `__Host-memory-session=${token}`);
  headers.set("origin", "https://memory.crgmhrc.asia");
  headers.set("content-type", "application/json");
  const context = createExecutionContext();
  const response = await createApp().fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { ...init, headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}

async function seedKnowledge(): Promise<void> {
  const markdown = "# Recent Guide\n\nRecent body\n";
  const hash = await sha256Hex(markdown);
  await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('recent-a', 'subject-recent-a', 'recent-a@example.test', 'contributor', 'active', ?, ?)").bind(NOW, NOW).run();
  await env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, kind, status, title, content, created_at, updated_at) VALUES ('recent-submission', 'recent-a', 'default', 'markdown', 'published', 'Recent Guide', ?, ?, ?)").bind(markdown, NOW, NOW).run();
  await env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, kind, title, created_at, updated_at) VALUES ('recent-source', 'recent-a', 'default', 'markdown', 'Recent Guide', ?, ?)").bind(NOW, NOW).run();
  await env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('recent-source-version', 'recent-source', 'recent-submission', 1, ?, ?, 'm1-v1', ?)").bind(markdown, hash, NOW).run();
  await env.DB.prepare("INSERT INTO knowledge_items (id, space_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('knowledge-recent', 'default', NULL, 'active', 'indexed', ?, ?)").bind(NOW, NOW).run();
  await env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES ('recent-revision', 'knowledge-recent', 'recent-source-version', '/workspace/published/default/knowledge-recent/recent-revision.md', ?, 'Recent Guide', '[]', 'shared', 'recent-a', ?)").bind(hash, NOW).run();
  await env.DB.prepare("INSERT INTO chunks (id, revision_id, ordinal, heading_path, start_line, end_line, body, search_title, search_tags, search_body) VALUES ('recent-chunk', 'recent-revision', 0, '[\"Recent Guide\"]', 3, 3, 'Recent body', 'Recent Guide', '', 'Recent body')").run();
  await env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'recent-revision' WHERE id = 'knowledge-recent'").run();
  const stub = env.KNOWLEDGE.get(env.KNOWLEDGE.idFromName("personal")) as DurableObjectStub<KnowledgeBase>;
  const result = await stub.commitPublishedContent({ spaceId: "default", knowledgeItemId: "knowledge-recent", revisionId: "recent-revision", contentSha256: hash, markdown }) as RpcResult<unknown>;
  expect(result.ok).toBe(true);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
