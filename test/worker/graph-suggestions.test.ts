/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = new Date("2026-09-20T12:00:00.000Z");
const HASH = "a".repeat(64);

describe("graph suggestions worker contract", () => {
  let sessionA = "";
  let sessionB = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)").bind(
      "suggest-a", "subject-suggest-a", "suggest-a@example.test", NOW.toISOString(), NOW.toISOString(),
      "suggest-b", "subject-suggest-b", "suggest-b@example.test", NOW.toISOString(), NOW.toISOString(),
    ).run();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO projects (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at) VALUES (?, ?, ?, ?, '', 'active', 0, NULL, ?, ?)").bind("suggest-project", "suggest-a", "suggest-project-key", "Suggestion project", NOW.getTime(), NOW.getTime()),
      env.DB.prepare("INSERT INTO project_timeline_items (id, member_id, project_id, client_key, kind, title, body, status, starts_at, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '', 'done', NULL, NULL, ?, ?)").bind("suggest-meeting", "suggest-a", "suggest-project", "meeting-key", "meeting", "Product review", NOW.getTime(), NOW.getTime()),
      env.DB.prepare("INSERT INTO project_timeline_items (id, member_id, project_id, client_key, kind, title, body, status, starts_at, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '', 'done', NULL, NULL, ?, ?)").bind("suggest-decision", "suggest-a", "suggest-project", "decision-key", "decision", "Use edge deployment", NOW.getTime(), NOW.getTime()),
      env.DB.prepare("INSERT INTO project_timeline_items (id, member_id, project_id, client_key, kind, title, body, status, starts_at, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '', 'open', NULL, NULL, ?, ?)").bind("suggest-action", "suggest-a", "suggest-project", "action-key", "action_item", "Prepare migration checklist", NOW.getTime(), NOW.getTime()),
      env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, due_at, completed_at, created_at, updated_at) VALUES (?, ?, ?, '', 'todo', 0, 'medium', NULL, NULL, ?, ?)").bind("suggest-task", "suggest-a", "Review security policy", NOW.getTime(), NOW.getTime()),
      env.DB.prepare("INSERT INTO project_tasks (project_id, member_id, task_id, created_at) VALUES (?, ?, ?, ?)").bind("suggest-project", "suggest-a", "suggest-task", NOW.getTime()),
    ]);
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => NOW });
    sessionA = (await sessions.create((await members.findByIdentitySubject("subject-suggest-a"))!)).token;
    sessionB = (await sessions.create((await members.findByIdentitySubject("subject-suggest-b"))!)).token;
  });

  it("returns only the signed-in member's graph suggestions and does not write promotions", async () => {
    const response = await api("/api/graph/suggestions", sessionA);
    expect(response.status).toBe(200);
    const body = await response.json() as { suggestions: Array<{ promotionRequired: boolean; sourceNodeIds: string[] }> };
    expect(body.suggestions.every((item) => item.promotionRequired)).toBe(true);
    expect(body.suggestions.every((item) => item.sourceNodeIds.every((id) => id.includes("suggest-")))).toBe(true);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM project_timeline_items WHERE member_id = 'suggest-a'").first<{ count: number }>())?.count).toBe(3);
  });

  it("rejects a non-member and hides another member's graph", async () => {
    expect((await api("/api/graph/suggestions", "missing-session")).status).toBe(401);
    const response = await api("/api/graph/suggestions", sessionB);
    expect(response.status).toBe(200);
    expect((await response.json() as { suggestions: unknown[] }).suggestions).toEqual([]);
  });
});

async function api(path: string, token: string): Promise<Response> {
  const headers = new Headers({ cookie: `__Host-memory-session=${token}`, origin: "https://memory.crgmhrc.asia" });
  const context = createExecutionContext();
  const response = await createApp({ ai: { run: async () => ({ response: JSON.stringify({ suggestions: [], insufficientEvidence: true }) }) } as never }).fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}
