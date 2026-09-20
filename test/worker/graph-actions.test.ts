/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = new Date("2026-09-20T10:00:00.000Z");
const HASH = "a".repeat(64);

describe("graph action worker contract", () => {
  let sessionA = "";
  let sessionB = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    vi.useFakeTimers({ now: NOW });

    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)",
    ).bind(
      "graph-action-a", "subject-graph-action-a", "graph-action-a@example.test", NOW.toISOString(), NOW.toISOString(),
      "graph-action-b", "subject-graph-action-b", "graph-action-b@example.test", NOW.toISOString(), NOW.toISOString(),
    ).run();

    await env.DB.prepare(
      "INSERT INTO projects (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at) VALUES (?, ?, ?, ?, '', 'active', 0, NULL, ?, ?), (?, ?, ?, ?, '', 'active', 0, NULL, ?, ?)",
    ).bind(
      "graph-project-a", "graph-action-a", "graph-project-a-key", "Private project A", NOW.getTime(), NOW.getTime(),
      "graph-project-b", "graph-action-b", "graph-project-b-key", "Private project B", NOW.getTime(), NOW.getTime(),
    ).run();

    await env.DB.prepare(
      "INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at) VALUES (?, ?, ?, '', 'todo', 0, 'medium', ?, ?), (?, ?, ?, '', 'todo', 0, 'medium', ?, ?)",
    ).bind(
      "graph-source-task-a", "graph-action-a", "Source task A", NOW.getTime(), NOW.getTime(),
      "graph-source-task-b", "graph-action-b", "Source task B", NOW.getTime(), NOW.getTime(),
    ).run();

    await seedKnowledge();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => NOW });
    sessionA = (await sessions.create((await members.findByIdentitySubject("subject-graph-action-a"))!)).token;
    sessionB = (await sessions.create((await members.findByIdentitySubject("subject-graph-action-b"))!)).token;
  });

  it("creates a knowledge-linked task idempotently and keeps it member-private", async () => {
    const first = await api("/api/tasks", sessionA, {
      method: "POST",
      body: JSON.stringify({ id: "graph-task-a", title: "Review Alpha", notes: "", priority: "medium", dueAt: null, knowledgeItemId: "graph-knowledge-a" }),
    });
    expect(first.status).toBe(201);
    const firstBody = await first.json() as { task: { id: string }; link?: { knowledgeItemId: string } };
    expect(firstBody).toMatchObject({ task: { id: "graph-task-a" }, link: { knowledgeItemId: "graph-knowledge-a" } });

    const replay = await api("/api/tasks", sessionA, {
      method: "POST",
      body: JSON.stringify({ id: "graph-task-a", title: "Ignored retry", notes: "", priority: "low", dueAt: null, knowledgeItemId: "graph-knowledge-a" }),
    });
    expect(replay.status).toBe(200);
    expect((await replay.json() as { task: { id: string; title: string } }).task).toMatchObject({ id: "graph-task-a", title: "Review Alpha" });

    expect((await api("/api/tasks/graph-task-a", sessionB)).status).toBe(404);
  });

  it("starts focus idempotently and rejects a cross-member task", async () => {
    const first = await api("/api/focus", sessionA, {
      method: "POST",
      body: JSON.stringify({ id: "graph-focus-a", clientKey: "graph-focus-key", taskId: "graph-source-task-a", title: "Focus on Alpha", durationMinutes: 25 }),
    });
    expect(first.status).toBe(201);
    const firstBody = await first.json() as { session: { id: string; taskId: string } };
    expect(firstBody.session).toMatchObject({ id: "graph-focus-a", taskId: "graph-source-task-a" });

    const replay = await api("/api/focus", sessionA, {
      method: "POST",
      body: JSON.stringify({ id: "ignored-focus-id", clientKey: "graph-focus-key", taskId: "graph-source-task-a", title: "Ignored retry", durationMinutes: 25 }),
    });
    expect(replay.status).toBe(200);
    expect((await replay.json() as { session: { id: string } }).session.id).toBe("graph-focus-a");

    expect((await api("/api/focus", sessionB, {
      method: "POST",
      body: JSON.stringify({ id: "graph-focus-b", clientKey: "graph-focus-b-key", taskId: "graph-source-task-a", title: "Cross-member", durationMinutes: 25 }),
    })).status).toBe(404);
  });

  it("creates a project action item idempotently and keeps project scope private", async () => {
    const first = await api("/api/projects/graph-project-a/timeline", sessionA, {
      method: "POST",
      body: JSON.stringify({ id: "graph-action-item-a", clientKey: "graph-action-item-key", kind: "action_item", title: "Choose launch date", body: "", startsAt: null, dueAt: null }),
    });
    expect(first.status).toBe(201);
    expect((await first.json() as { item: { projectId: string; kind: string } }).item).toMatchObject({ projectId: "graph-project-a", kind: "action_item" });

    const replay = await api("/api/projects/graph-project-a/timeline", sessionA, {
      method: "POST",
      body: JSON.stringify({ id: "ignored-timeline-id", clientKey: "graph-action-item-key", kind: "decision", title: "Ignored retry" }),
    });
    expect(replay.status).toBe(200);
    expect((await replay.json() as { item: { id: string; kind: string; title: string } }).item).toMatchObject({ id: "graph-action-item-a", kind: "action_item", title: "Choose launch date" });

    expect((await api("/api/projects/graph-project-a/timeline?limit=20", sessionB)).status).toBe(404);
    expect((await api("/api/projects/graph-project-b/timeline?limit=20", sessionA)).status).toBe(404);
  });
});

async function seedKnowledge(): Promise<void> {
  const now = NOW.toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, kind, status, title, content, created_at, updated_at) VALUES (?, ?, 'default', 'markdown', 'published', ?, ?, ?, ?)").bind("graph-submission-a", "graph-action-a", "Graph source A", "# Graph source A", now, now),
    env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, kind, title, created_at, updated_at) VALUES (?, ?, 'default', 'markdown', ?, ?, ?)").bind("graph-source-a", "graph-action-a", "Graph source A", now, now),
    env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES (?, ?, ?, 1, ?, ?, 'm1-v1', ?)").bind("graph-source-version-a", "graph-source-a", "graph-submission-a", "# Graph source A", HASH, now),
    env.DB.prepare("INSERT INTO knowledge_items (id, space_id, current_revision_id, status, search_status, created_at, updated_at) VALUES (?, 'default', NULL, 'active', 'indexed', ?, ?)").bind("graph-knowledge-a", now, now),
    env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES (?, ?, ?, ?, ?, ?, '[]', 'shared', ?, ?)").bind("graph-revision-a", "graph-knowledge-a", "graph-source-version-a", "/workspace/published/default/graph-knowledge-a/graph-revision-a.md", HASH, "Graph source A", "graph-action-a", now),
  ]);
  await env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'graph-revision-a' WHERE id = 'graph-knowledge-a'").run();
}

async function api(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("cookie", `__Host-memory-session=${token}`);
  headers.set("origin", "https://memory.crgmhrc.asia");
  if (init.body) headers.set("content-type", "application/json");
  const context = createExecutionContext();
  const response = await createApp().fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { ...init, headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}
