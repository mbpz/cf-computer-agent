/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_CONFIG } from "../../src/config";
import { createApp } from "../../src/app";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { dispatchGraphAction, queryGraphAction } from "../../frontend/lib/graph-actions";
import { TasksRepository } from "../../src/tasks/repository";
import { TasksService } from "../../src/tasks/service";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = new Date("2026-09-20T10:00:00.000Z");
const HASH = "a".repeat(64);

describe("knowledge task creation atomicity", () => {
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

  const input = { id: "atomic-task", title: "Review knowledge", knowledgeItemId: "graph-knowledge-a" };
  const post = (token: string, body = input) => api("/api/tasks", token, { method: "POST", body: JSON.stringify(body) });
  async function counts() {
    return {
      tasks: await env.DB.prepare("SELECT COUNT(*) AS n FROM tasks WHERE id = ?").bind(input.id).first("n"),
      links: await env.DB.prepare("SELECT COUNT(*) AS n FROM task_links WHERE task_id = ?").bind(input.id).first("n"),
      audits: await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE resource_id = ?").bind(input.id).first("n"),
    };
  }

  it("rejects an invisible knowledge target without leaving a task or success audit", async () => {
    expect((await post(sessionA, { ...input, knowledgeItemId: "missing-knowledge" })).status).toBe(404);
    expect(await counts()).toEqual({ tasks: 0, links: 0, audits: 0 });
  });

  it.each(["link", "task.created", "task.linked"])("rolls back the whole creation on %s failure, then safely retries the same ID", async (failure) => {
    const table = failure === "link" ? "task_links" : "audit_events";
    const condition = failure === "link" ? "" : `WHEN NEW.action = '${failure}'`;
    await env.DB.exec(`CREATE TRIGGER fail_task_creation BEFORE INSERT ON ${table} ${condition} BEGIN SELECT RAISE(ABORT, 'forced task creation failure'); END;`);
    expect((await post(sessionA)).status).toBe(500);
    expect(await counts()).toEqual({ tasks: 0, links: 0, audits: 0 });
    await env.DB.exec("DROP TRIGGER fail_task_creation;");
    const retry = await post(sessionA);
    expect(retry.status).toBe(201);
    expect(await retry.json()).toMatchObject({ created: true, task: { id: input.id }, link: { taskId: input.id, knowledgeItemId: input.knowledgeItemId } });
    expect(await counts()).toEqual({ tasks: 1, links: 1, audits: 2 });
  });

  it("returns the exact task and link on replay without duplicating either audit", async () => {
    const first = await post(sessionA);
    expect(first.status).toBe(201);
    const firstBody = await first.json() as { link: unknown };
    const retry = await post(sessionA);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ created: false, task: { id: input.id }, link: firstBody.link });
    const detail = await api(`/api/tasks/${input.id}`, sessionA);
    expect(await detail.json()).toMatchObject({ task: { id: input.id }, links: [firstBody.link] });
    expect((await api(`/api/tasks/${input.id}`, sessionB)).status).toBe(404);
    expect(await counts()).toEqual({ tasks: 1, links: 1, audits: 2 });
  });

  it("reauthorizes the knowledge target on an otherwise valid replay", async () => {
    expect((await post(sessionA)).status).toBe(201);
    await env.DB.prepare("UPDATE revisions SET visibility = 'admin_only' WHERE id = 'graph-revision-a'").run();
    expect((await post(sessionA)).status).toBe(404);
    expect(await counts()).toEqual({ tasks: 1, links: 1, audits: 2 });
  });

  it.each(["preexisting task", "removed link"])("does not silently adopt or relink a %s", async (state) => {
    if (state === "preexisting task") {
      expect((await api("/api/tasks", sessionA, { method: "POST", body: JSON.stringify({ id: input.id, title: input.title }) })).status).toBe(201);
    } else {
      const created = await post(sessionA);
      expect(created.status).toBe(201);
      const body = await created.json() as { link: { id: string } };
      expect((await api(`/api/tasks/${input.id}/links/${body.link.id}`, sessionA, { method: "DELETE" })).status).toBe(204);
    }
    const before = await counts();
    const retry = await post(sessionA);
    expect(retry.status).toBe(409);
    expect(await retry.json()).toMatchObject({ error: { code: "TASK_CREATE_CONFLICT" } });
    expect(await counts()).toEqual(before);
    expect(before.links).toBe(0);
  });

  it("returns one complete result for concurrent identical creation requests", async () => {
    const responses = await Promise.all([post(sessionA), post(sessionA)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    const bodies = await Promise.all(responses.map((response) => response.json())) as Array<{ link: unknown }>;
    for (const body of bodies) expect(body).toMatchObject({ task: { id: input.id }, link: { taskId: input.id, knowledgeItemId: input.knowledgeItemId } });
    expect(bodies[0]!.link).toEqual(bodies[1]!.link);
    expect(await counts()).toEqual({ tasks: 1, links: 1, audits: 2 });
  });

  it("does not let a competing same-ID request add a different knowledge link", async () => {
    await seedKnowledge("other");
    const responses = await Promise.all([post(sessionA), post(sessionA, { ...input, knowledgeItemId: "graph-knowledge-other" })]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await counts()).toEqual({ tasks: 1, links: 1, audits: 2 });
  });

  it("does not attach a link or audit to another member's existing task ID", async () => {
    expect((await post(sessionA)).status).toBe(201);
    expect((await post(sessionB)).status).toBe(404);
    expect(await counts()).toEqual({ tasks: 1, links: 1, audits: 2 });
  });

  it("rechecks knowledge authorization in the atomic write after a stale preflight", async () => {
    class RevokingRepository extends TasksRepository {
      override async isKnowledgeVisible(memberId: string, id: string) {
        const visible = await super.isKnowledgeVisible(memberId, id);
        await env.DB.prepare("UPDATE revisions SET visibility = 'admin_only' WHERE id = 'graph-revision-a'").run();
        return visible;
      }
    }
    const service = new TasksService(new RevokingRepository(env.DB));
    await expect(service.create("graph-action-a", input)).rejects.toMatchObject({ code: "TASK_KNOWLEDGE_NOT_FOUND", status: 404 });
    expect(await counts()).toEqual({ tasks: 0, links: 0, audits: 0 });
  });

  it("enforces the task quota in the write even when the count preflight is stale", async () => {
    class FillingRepository extends TasksRepository {
      filled = false;
      override async countByMember(memberId: string) {
        const count = await super.countByMember(memberId);
        if (!this.filled) {
          this.filled = true;
          await env.DB.prepare(`WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n < ?)
            INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at)
            SELECT 'quota-' || n, ?, 'Quota', '', 'todo', 0, 'medium', ?, ? FROM numbers`)
            .bind(APP_CONFIG.maxTasksPerMember - count, memberId, NOW.getTime(), NOW.getTime()).run();
        }
        return count;
      }
    }
    const service = new TasksService(new FillingRepository(env.DB));
    await expect(service.create("graph-action-a", input)).rejects.toMatchObject({ code: "TASK_LIMIT_REACHED", status: 409 });
    expect(await counts()).toEqual({ tasks: 0, links: 0, audits: 0 });
    expect(await new TasksRepository(env.DB).countByMember("graph-action-a")).toBe(APP_CONFIG.maxTasksPerMember);
  });

  it("rolls back rather than silently ignoring a conflicting link ID", async () => {
    const existing = await post(sessionA, { ...input, id: "other-task" });
    expect(existing.status).toBe(201);
    const receipt = await existing.json() as { link: { id: string } };
    const service = new TasksService(new TasksRepository(env.DB), { id: () => receipt.link.id });
    await expect(service.create("graph-action-a", input)).rejects.toThrow();
    expect(await counts()).toEqual({ tasks: 0, links: 0, audits: 0 });
    expect((await api("/api/tasks/other-task", sessionA)).status).toBe(200);
  });

  it("does not confirm a revoked knowledge relation through exact task lookup", async () => {
    expect((await post(sessionA)).status).toBe(201);
    await env.DB.prepare("UPDATE revisions SET visibility = 'admin_only' WHERE id = 'graph-revision-a'").run();
    const request = { node: { id: `knowledge:${input.knowledgeItemId}`, kind: "knowledge" as const, label: input.title, status: null, href: `/knowledge/${input.knowledgeItemId}`, metadata: {} }, clientKey: input.id };
    const requester: typeof fetch = (path, init) => api(String(path), sessionA, init);
    await expect(queryGraphAction(request, requester)).rejects.toThrow("GRAPH_ACTION_RECEIPT_UNKNOWN");
    expect(await counts()).toEqual({ tasks: 1, links: 1, audits: 2 });
  });

  it("recovers a failed link write through the real graph dispatcher and exact GET", async () => {
    await env.DB.exec("CREATE TRIGGER fail_task_link BEFORE INSERT ON task_links BEGIN SELECT RAISE(ABORT, 'forced link failure'); END;");
    const request = { node: { id: `knowledge:${input.knowledgeItemId}`, kind: "knowledge" as const, label: input.title, status: null, href: `/knowledge/${input.knowledgeItemId}`, metadata: {} }, clientKey: input.id };
    const requester: typeof fetch = async (path, init) => api(String(path), sessionA, init);
    await expect(dispatchGraphAction(request, requester)).rejects.toThrow();
    await env.DB.exec("DROP TRIGGER fail_task_link;");
    expect(await dispatchGraphAction(request, requester)).toMatchObject({ status: "completed", data: { created: true, link: { knowledgeItemId: input.knowledgeItemId } } });
    const detail = await api(`/api/tasks/${input.id}`, sessionA);
    expect(await detail.json()).toMatchObject({ task: { id: input.id }, links: [expect.objectContaining({ knowledgeItemId: input.knowledgeItemId })] });
    expect(await counts()).toEqual({ tasks: 1, links: 1, audits: 2 });
  });
});

async function seedKnowledge(suffix = "a"): Promise<void> {
  const now = NOW.toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, kind, status, title, content, created_at, updated_at) VALUES (?, ?, 'default', 'markdown', 'published', ?, ?, ?, ?)").bind(`graph-submission-${suffix}`, "graph-action-a", "Graph source A", "# Graph source A", now, now),
    env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, kind, title, created_at, updated_at) VALUES (?, ?, 'default', 'markdown', ?, ?, ?)").bind(`graph-source-${suffix}`, "graph-action-a", "Graph source A", now, now),
    env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES (?, ?, ?, 1, ?, ?, 'm1-v1', ?)").bind(`graph-source-version-${suffix}`, `graph-source-${suffix}`, `graph-submission-${suffix}`, "# Graph source A", HASH, now),
    env.DB.prepare("INSERT INTO knowledge_items (id, space_id, current_revision_id, status, search_status, created_at, updated_at) VALUES (?, 'default', NULL, 'active', 'indexed', ?, ?)").bind(`graph-knowledge-${suffix}`, now, now),
    env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES (?, ?, ?, ?, ?, ?, '[]', 'shared', ?, ?)").bind(`graph-revision-${suffix}`, `graph-knowledge-${suffix}`, `graph-source-version-${suffix}`, `/workspace/published/default/graph-knowledge-${suffix}/graph-revision-${suffix}.md`, HASH, "Graph source A", "graph-action-a", now),
  ]);
  await env.DB.prepare("UPDATE knowledge_items SET current_revision_id = ? WHERE id = ?").bind(`graph-revision-${suffix}`, `graph-knowledge-${suffix}`).run();
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
